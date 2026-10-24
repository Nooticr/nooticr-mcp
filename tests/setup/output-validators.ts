/**
 * Compiles each tool's output-schema validator once per test worker.
 *
 * The SDK's `Client.listTools()` compiles an Ajv validator for every tool that
 * declares an output schema, with a fresh Ajv instance per client. Over 169
 * tools that is ~1.3 s of synchronous CPU per call, and the suite builds a new
 * client for almost every test: it was most of the unit tests' run time, and
 * the blocked event loop is what timed out vitest's worker RPC
 * (`Timeout calling "onTaskUpdate"`) whenever more than one worker ran.
 *
 * Validation itself is unchanged: the same SDK class compiles the same schema
 * with the same options, and a validator is a pure function of its schema, so
 * one compiled from an identical schema is the same check. Only the repeated
 * compiling goes. Hosts are not affected; this file only runs under vitest.
 */
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv-provider.js";

type GetValidator = AjvJsonSchemaValidator["getValidator"];

const compiled = new Map<string, ReturnType<GetValidator>>();
const compile = AjvJsonSchemaValidator.prototype.getValidator;

AjvJsonSchemaValidator.prototype.getValidator = function (
  this: AjvJsonSchemaValidator,
  schema: Parameters<GetValidator>[0]
) {
  const key = JSON.stringify(schema);
  let validator = compiled.get(key);
  if (!validator) {
    validator = compile.call(this, schema);
    compiled.set(key, validator);
  }
  return validator;
} as GetValidator;
