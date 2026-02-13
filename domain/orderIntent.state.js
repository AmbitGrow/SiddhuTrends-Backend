const ALLOWED_TRANSITIONS = {
  CREATED: ["RESERVED", "EXPIRED", "CANCELLED"],
  RESERVED: ["PAYMENT_IN_PROGRESS", "EXPIRED", "CANCELLED"],
  PAYMENT_IN_PROGRESS: ["CONVERTED", "CANCELLED"],
  CANCELLED: [],
  EXPIRED: [],
  CONVERTED: []
};

export function transitionOrderIntent(currentState, nextState) {
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];

  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid OrderIntent transition: ${currentState} → ${nextState}`
    );
  }

  return nextState;
}
