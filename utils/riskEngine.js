export const evaluateRisk = (user) => {
  let risk = 0;

  // Login attempts
  if (user.loginAttempts >= 5) {
    risk += 10;
  }

  if (user.loginAttempts >= 10) {
    risk += 20;
  }

  // Future conditions:
  // if (user.referralAbuse) risk += 20
  // if (user.refundRatio > 0.6) risk += 30

  return risk;
};
