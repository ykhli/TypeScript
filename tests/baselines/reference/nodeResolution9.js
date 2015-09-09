//// [tests/cases/compiler/nodeResolution9.ts] ////

//// [m.ts]

export var x = 1;

//// [m.d.ts]
export declare interface I { x }

//// [index.d.ts]
// should load m.d.ts file
import * as m from './m'
declare var v: m.I;

//// [b.ts]
import y = require("a");

//// [b.js]
