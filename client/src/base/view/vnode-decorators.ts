import {VNode} from "snabbdom/vnode"
import {SModelElement} from "../model"
import {VNodeUtils} from "./vnode-utils"
import {injectable} from "inversify"

/**
 * Manipulates a created VNode after it has been created.
 * Used to register listeners and add animations.
 */
export interface VNodeDecorator {
    decorate(vnode: VNode, element: SModelElement): VNode

    postUpdate(): void
}

@injectable()
export class FocusFixDecorator implements VNodeDecorator {
    decorate(vnode: VNode, element: SModelElement): VNode {
        if (vnode.sel && vnode.sel.startsWith('svg'))
        // allows to set focus in Firefox
            VNodeUtils.setAttr(vnode, 'tabindex', 0)
        return vnode
    }

    postUpdate(): void {
    }
}

export class AddRemoveAnimationDecorator implements VNodeDecorator {

    readonly appearFadeStyle = {
        opacity: '0',
        transition: 'opacity 0.5s',
        delayed: {opacity: '1'},
        remove: {opacity: '0'}
    }

    decorate(vnode: VNode, element: SModelElement) {
        VNodeUtils.mergeStyle(vnode, this.appearFadeStyle)
        return vnode
    }

    postUpdate() {
    }
}