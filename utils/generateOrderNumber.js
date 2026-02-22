const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${new Date().getFullYear()}${timestamp}-${random}`;
};

export default generateOrderNumber;
