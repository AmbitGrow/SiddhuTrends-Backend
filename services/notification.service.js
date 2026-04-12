export const notifyOrderConfirmed = async (payload) => {
  console.log("🔔 notifyOrderConfirmed", payload);
};

export const notifyOrderShipped = async (payload) => {
  console.log("🔔 notifyOrderShipped", payload);
};

export const notifyOrderDelivered = async (payload) => {
  console.log("🔔 notifyOrderDelivered", payload);
};

export const notifyOrderCancelled = async (payload) => {
  console.log("🔔 notifyOrderCancelled", payload);
};

export const notifyOrderRefunded = async (payload) => {
  console.log("🔔 notifyOrderRefunded", payload);
};

export const notifyRefundInitiated = async (payload) => {
  console.log("🔔 notifyRefundInitiated", payload);
};
