module.exports = () => {
  const timestamp = Date.now().toString().slice(-6);
  return `ORD-${new Date().getFullYear()}-${timestamp}`;
};
