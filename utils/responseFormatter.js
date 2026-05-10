/**
 * Standard API Response Formatter
 * Use this to ensure consistent responses across all endpoints.
 * 
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {Object|Array} [data] - Optional response payload
 */
export const successResponse = (res, statusCode = 200, message = "Success", data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};
