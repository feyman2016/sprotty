/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import "mocha"
import { expect } from "chai"
import { almostEquals, euclideanDistance, manhattanDistance, Bounds, combine, includes, ORIGIN_POINT } from "./geometry"

describe('euclideanDistance', () => {
    it('works as expected', () => {
        expect(euclideanDistance({x: 0, y: 0}, {x: 3, y: 4})).to.equal(5)
    })
})

describe('manhattanDistance', () => {
    it('works as expected', () => {
        expect(manhattanDistance({x: 0, y: 0}, {x: 3, y: 4})).to.equal(7)
    })
})

describe('almostEquals', () => {
    it('returns false for clearly different values', () => {
        expect(almostEquals(3, 17)).to.be.false
    })
    it('returns true for almost equal values', () => {
        expect(almostEquals(3.12895, 3.12893)).to.be.true
    })
})

describe('combine', () => {
    it('includes all corner points of the input bounds', () => {
        const b0: Bounds = { x: 2, y: 2, width: 4, height: 6 }
        const b1: Bounds = { x: 5, y: 3, width: 5, height: 10 }
        const b2 = combine(b0, b1)
        expect(includes(b2, b0)).to.be.true
        expect(includes(b2, b1)).to.be.true
        expect(includes(b2, { x: b0.x + b0.width, y: b0.y + b0.height })).to.be.true
        expect(includes(b2, { x: b1.x + b1.width, y: b1.y + b1.height })).to.be.true
        expect(includes(b2, ORIGIN_POINT)).to.be.false
        expect(includes(b2, { x: 100, y: 100 })).to.be.false
    })
})
