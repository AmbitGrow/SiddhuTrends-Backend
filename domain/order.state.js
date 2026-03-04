const ALLOWED_TRANSITIONS = {
  CONFIRMED: ["SHIPPED", "CANCELLED", "REFUND_INITIATED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUND_INITIATED"],
  REFUND_INITIATED: ["REFUNDED"],
  REFUNDED: [],
  CANCELLED: []
};

export function transitionOrder(currentState, nextState) {
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];

  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid Order transition: ${currentState} → ${nextState}`
    );
  }

  return nextState;
}
