/// <reference path="../bin/typescript.d.ts" />
import { SourceFile, Node, Map } from "typescript";

export * from "typescript";

export interface EmitTextWriter {
    write(s: string): void;
    writeTextOfNode(sourceFile: SourceFile, node: Node): void;
    writeLine(): void;
    increaseIndent(): void;
    decreaseIndent(): void;
    getText(): string;
    rawWrite(s: string): void;
    writeLiteral(s: string): void;
    getTextPos(): number;
    getLine(): number;
    getColumn(): number;
    getIndent(): number;
}

export declare function computeLineStarts(text: string): number[];
export declare function createTextWriter(newLine: String): EmitTextWriter;
export declare function getSourceTextOfNodeFromSourceFile(sourceFile: SourceFile, node: Node): string;
export declare function combinePaths(path1: string, path2: string): string;
export declare function hasProperty<T>(map: Map<T>, key: string): boolean;
export declare function getProperty<T>(map: Map<T>, key: string): T;