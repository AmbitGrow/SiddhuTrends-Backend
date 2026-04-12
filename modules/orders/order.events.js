import { EventEmitter } from "events";

export const orderEventEmitter = new EventEmitter();

orderEventEmitter.on("newListener", (event) => {
  console.log(`Order lifecycle listener added for ${event}`);
});
