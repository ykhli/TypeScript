// @module: commonjs
// @moduleResolution: node

// @filename: node_modules/a/index.d.ts
declare module "a" {
    var x: number;
}

// @filename: b.ts
import * as y from "a";

// @filename: c.ts
import x = require("./b");
