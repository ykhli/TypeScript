// @module: commonjs
// @moduleResolution: node

// @filename: node_modules/a/m.ts
export var x = 1;

// @filename: node_modules/a/m.d.ts
export declare interface I { x }

// @filename: node_modules/a/index.d.ts
// should load m.d.ts file
import * as m from './m'
declare var v: m.I;

// @filename: b.ts
import y = require("a");