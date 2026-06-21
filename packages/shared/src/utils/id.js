"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.generateJobId = generateJobId;
exports.generateRequestId = generateRequestId;
const crypto_1 = require("crypto");
function generateId() {
    return (0, crypto_1.randomUUID)();
}
function generateJobId(queue, entityId) {
    return `${queue}:${entityId}:${Date.now()}`;
}
function generateRequestId() {
    return (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 16);
}
//# sourceMappingURL=id.js.map