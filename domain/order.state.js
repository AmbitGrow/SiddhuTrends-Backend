const ALLOWED_TRANSITIONS = {
  CONFIRMED: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  REFUNDED: []
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
