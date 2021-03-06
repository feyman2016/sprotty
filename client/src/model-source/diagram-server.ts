/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify"
import { TYPES } from "../base/types"
import { Bounds, Point } from "../utils/geometry"
import { ILogger } from "../utils/logging"
import { SModelRootSchema, SModelIndex, SModelElementSchema } from "../base/model/smodel"
import { SModelStorage } from "../base/model/smodel-storage"
import { Action } from "../base/actions/action"
import { ActionHandlerRegistry } from "../base/actions/action-handler"
import { IActionDispatcher } from "../base/actions/action-dispatcher"
import { ICommand } from "../base/commands/command"
import { ViewerOptions } from "../base/views/viewer-options"
import { SetModelCommand, SetModelAction } from "../base/features/set-model"
import { UpdateModelCommand, UpdateModelAction } from "../features/update/update-model"
import { ComputedBoundsAction, RequestBoundsCommand } from '../features/bounds/bounds-manipulation'
import { RequestPopupModelAction } from "../features/hover/hover"
import { ModelSource } from "./model-source"
import { ExportSvgAction } from '../features/export/svg-exporter'
import { saveAs } from 'file-saver'
import { CollapseExpandAction, CollapseExpandAllAction } from '../features/expand/expand'
import { OpenAction } from '../features/open/open'

/**
 * Wrapper for actions when transferring them between client and server via a DiagramServer.
 */
export interface ActionMessage {
    clientId: string
    action: Action
}

export function isActionMessage(object: any): object is ActionMessage {
    return object !== undefined && object.hasOwnProperty('clientId') && object.hasOwnProperty('action')
}

/**
 * Sent by the external server when to signal a state change.
 */
export class ServerStatusAction {
    static KIND = 'serverStatus'
    kind = ServerStatusAction.KIND
    severity: string
    message: string
}

const receivedFromServerProperty = '__receivedFromServer'

/**
 * A ModelSource that communicates with an external model provider, e.g.
 * a model editor.
 *
 * This class defines which actions are sent to and received from the
 * external model source.
 */
@injectable()
export abstract class DiagramServer extends ModelSource {

    clientId: string

    protected currentRoot: SModelRootSchema = {
        type: 'NONE',
        id: 'ROOT'
    }

    protected lastSubmittedModelType: string

    constructor(@inject(TYPES.IActionDispatcher) actionDispatcher: IActionDispatcher,
                @inject(TYPES.ActionHandlerRegistry) actionHandlerRegistry: ActionHandlerRegistry,
                @inject(TYPES.ViewerOptions) viewerOptions: ViewerOptions,
                @inject(TYPES.SModelStorage) protected storage: SModelStorage,
                @inject(TYPES.ILogger) protected logger: ILogger) {
        super(actionDispatcher, actionHandlerRegistry, viewerOptions)
        this.clientId = this.viewerOptions.baseDiv
    }

    protected initialize(registry: ActionHandlerRegistry): void {
        super.initialize(registry)

        // Register model manipulation commands
        registry.registerCommand(UpdateModelCommand)

        // Register this model source
        registry.register(ComputedBoundsAction.KIND, this)
        registry.register(RequestBoundsCommand.KIND, this)
        registry.register(RequestPopupModelAction.KIND, this)
        registry.register(CollapseExpandAction.KIND, this)
        registry.register(CollapseExpandAllAction.KIND, this)
        registry.register(OpenAction.KIND, this)
        registry.register(ServerStatusAction.KIND, this)
    }

    handle(action: Action): void | ICommand {
        const forwardToServer = this.handleLocally(action)
        if (forwardToServer) {
            const message: ActionMessage = {
                clientId: this.clientId,
                action: action
            }
            this.logger.log(this, 'sending', message)
            this.sendMessage(message)
        }
    }

    protected abstract sendMessage(message: ActionMessage): void

    protected messageReceived(data: any): void {
        const object = typeof(data) === 'string' ? JSON.parse(data) : data
        if (isActionMessage(object) && object.action) {
            if (!object.clientId || object.clientId === this.clientId) {
                (object.action as any)[receivedFromServerProperty] = true
                this.logger.log(this, 'receiving', object)
                this.actionDispatcher.dispatch(object.action, this.storeNewModel.bind(this))
            }
        } else {
            this.logger.error(this, 'received data is not an action message', object)
        }
    }

    /**
     * Check whether the given action should be handled locally. Returns true if the action should
     * still be sent to the server, and false if it's only handled locally.
     */
    protected handleLocally(action: Action): boolean {
        this.storeNewModel(action)
        switch (action.kind) {
            case ComputedBoundsAction.KIND:
                return this.handleComputedBounds(action as ComputedBoundsAction)
            case RequestBoundsCommand.KIND:
                return false
            case ExportSvgAction.KIND:
                return this.handleExportSvgAction(action as ExportSvgAction)
            case ServerStatusAction.KIND:
                return this.handleServerStateAction(action as ServerStatusAction)
        }
        return !(action as any)[receivedFromServerProperty]
    }

    /**
     * Put the new model contained in the given action into the model storage, if there is any.
     */
    protected storeNewModel(action: Action): void {
        if (action.kind === SetModelCommand.KIND
            || action.kind === UpdateModelCommand.KIND
            || action.kind === RequestBoundsCommand.KIND) {
            const newRoot = (action as any).newRoot
            if (newRoot) {
                this.currentRoot = newRoot as SModelRootSchema
                if (action.kind === SetModelCommand.KIND || action.kind === UpdateModelCommand.KIND) {
                    this.lastSubmittedModelType = newRoot.type
                }
                this.storage.store(this.currentRoot)
            }
        }
    }

    /**
     * If the server requires to compute a layout, the computed bounds are forwarded. Otherwise they
     * are applied to the current model locally and a model update is triggered.
     */
    protected handleComputedBounds(action: ComputedBoundsAction): boolean {
        if (this.viewerOptions.needsServerLayout) {
            return true
        } else {
            const index = new SModelIndex()
            const root = this.currentRoot
            index.add(root)
            for (const b of action.bounds) {
                const element = index.getById(b.elementId)
                if (element !== undefined)
                    this.applyBounds(element, b.newBounds)
            }
            if (action.alignments !== undefined) {
                for (const a of action.alignments) {
                    const element = index.getById(a.elementId)
                    if (element !== undefined)
                        this.applyAlignment(element, a.newAlignment)
                }
            }
            if (root.type === this.lastSubmittedModelType) {
                this.actionDispatcher.dispatch(new UpdateModelAction(root))
            } else {
                this.actionDispatcher.dispatch(new SetModelAction(root))
            }
            this.lastSubmittedModelType = root.type
            return false
        }
    }

    protected applyBounds(element: SModelElementSchema, newBounds: Bounds) {
        const e = element as any
        e.position = { x: newBounds.x, y: newBounds.y }
        e.size = { width: newBounds.width, height: newBounds.height }
    }

    protected applyAlignment(element: SModelElementSchema, newAlignment: Point) {
        const e = element as any
        e.alignment = { x: newAlignment.x, y: newAlignment.y }
    }

    protected handleExportSvgAction(action: ExportSvgAction): boolean {
        const blob = new Blob([action.svg], {type: "text/plain;charset=utf-8"})
        saveAs(blob, "diagram.svg")
        return false
    }

    protected handleServerStateAction(action: ServerStatusAction): boolean {
        return false
    }
}
