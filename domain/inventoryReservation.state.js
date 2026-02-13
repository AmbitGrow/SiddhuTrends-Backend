const ALLOWED_TRANSITIONS = {
  ACTIVE: ["CONSUMED", "RELEASED", "EXPIRED"],
  CONSUMED: [],
  RELEASED: [],
  EXPIRED: []
};

export function transitionReservation(currentState, nextState) {
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];

  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid Reservation transition: ${currentState} → ${nextState}`
    );
  }

  return nextState;
}
