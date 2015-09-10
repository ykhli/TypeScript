//// [tests/cases/compiler/nodeResolution7.ts] ////

//// [index.d.ts]

declare module "a" {
    var x: number;
}

//// [b.ts]
import * as y from "a";

//// [c.ts]
import x = require("./b");


//// [b.js]
//// [c.js]
