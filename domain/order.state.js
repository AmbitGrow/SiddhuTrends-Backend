import { canTransition } from "../modules/orders/order.state.js";

export function transitionOrder(currentState, nextState) {
  if (!canTransition(currentState, nextState)) {
    throw new Error(
      `Invalid Order transition: ${currentState} → ${nextState}`
    );
  }

  return nextState;
}
