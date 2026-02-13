import EventEmitter from "events";

export const paymentEventEmitter = new EventEmitter();

paymentEventEmitter.on("newListener", (event) => {
	console.log(`Listener added for ${event}`);
});
