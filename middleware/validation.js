import Joi from "joi";

/**
 * Validation middleware factory
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map(d => d.message)
      });
    }
    
    next();
  };
};

/**
 * Auth Validation Schemas
 */
export const authSchemas = {
  signup: Joi.object({
    name: Joi.string().min(2).max(50).required().messages({
      "string.min": "Name must be at least 2 characters",
      "string.max": "Name cannot exceed 50 characters",
      "any.required": "Name is required"
    }),
    email: Joi.string().email().required().messages({
      "string.email": "Invalid email format",
      "any.required": "Email is required"
    }),
    password: Joi.string().min(8).required().messages({
      "string.min": "Password must be at least 8 characters",
      "any.required": "Password is required"
    })
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Invalid email format",
      "any.required": "Email is required"
    }),
    password: Joi.string().required().messages({
      "any.required": "Password is required"
    })
  })
};

/**
 * Cart Validation Schemas
 */
export const cartSchemas = {
  addToCart: Joi.object({
    productId: Joi.string().required().messages({
      "any.required": "Product ID is required"
    }),
    quantity: Joi.number().integer().min(1).required().messages({
      "number.min": "Quantity must be at least 1",
      "any.required": "Quantity is required"
    })
  }),

  updateQuantity: Joi.object({
    productId: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  }),

  mergeCart: Joi.object({
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required()
      })
    ).required()
  })
};

/**
 * Order Validation Schemas
 */
export const orderSchemas = {
  createOrderIntent: Joi.object({
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required()
      })
    ).min(1).required().messages({
      "array.min": "At least one item is required",
      "any.required": "Items are required"
    }),
    deliveryAddress: Joi.object({
      fullName: Joi.string().min(2).max(100).required(),
      phone: Joi.string().min(7).max(20).required(),
      addressLine1: Joi.string().min(3).max(200).required(),
      addressLine2: Joi.string().allow("", null),
      city: Joi.string().min(2).max(100).required(),
      state: Joi.string().min(2).max(100).required(),
      pincode: Joi.string().min(4).max(10).required()
    }).required().messages({
      "any.required": "Delivery address is required"
    })
  }),

  createOrderIntentFromCart: Joi.object({
    deliveryAddress: Joi.object({
      fullName: Joi.string().min(2).max(100).required(),
      phone: Joi.string().min(7).max(20).required(),
      addressLine1: Joi.string().min(3).max(200).required(),
      addressLine2: Joi.string().allow("", null),
      city: Joi.string().min(2).max(100).required(),
      state: Joi.string().min(2).max(100).required(),
      pincode: Joi.string().min(4).max(10).required()
    }).required().messages({
      "any.required": "Delivery address is required"
    })
  }),

  requestCancel: Joi.object({
    reason: Joi.string().min(3).max(500).required().messages({
      "string.min": "Cancellation reason must be at least 3 characters",
      "any.required": "Cancellation reason is required"
    })
  }),

  requestRefund: Joi.object({
    reason: Joi.string().min(3).max(500).required().messages({
      "string.min": "Refund reason must be at least 3 characters",
      "any.required": "Refund reason is required"
    })
  }),

  adminDecision: Joi.object({
    reason: Joi.string().min(3).max(500).required().messages({
      "string.min": "Decision reason must be at least 3 characters",
      "any.required": "Decision reason is required"
    })
  })
};

/**
 * Payment Validation Schemas
 */
export const paymentSchemas = {
  initiatePayment: Joi.object({
    paymentType: Joi.string().valid("ONLINE", "PARTIAL_COD").required().messages({
      "any.only": "Payment type must be ONLINE or PARTIAL_COD",
      "any.required": "Payment type is required"
    })
  }),

  verifyPayment: Joi.object({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required()
  })
};

/**
 * Product Validation Schemas (Admin)
 */
export const productSchemas = {
  createProduct: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow(""),
    images: Joi.array().items(Joi.string().uri()),
    price: Joi.number().min(0).required(),
    investmentCost: Joi.number().min(0).required(),
    categoryId: Joi.string().required(),
    ageGroupId: Joi.string().required(),
    stock: Joi.number().integer().min(0).required(),
    isBestSeller: Joi.boolean(),
    isOffer: Joi.boolean()
  }),

  updateProduct: Joi.object({
    name: Joi.string(),
    description: Joi.string().allow(""),
    images: Joi.array().items(Joi.string().uri()),
    price: Joi.number().min(0),
    investmentCost: Joi.number().min(0),
    categoryId: Joi.string(),
    ageGroupId: Joi.string(),
    stock: Joi.number().integer().min(0),
    isBestSeller: Joi.boolean(),
    isOffer: Joi.boolean(),
    isActive: Joi.boolean()
  }),

  updateStock: Joi.object({
    stock: Joi.number().integer().min(0),
    change: Joi.number().integer()
  }).or("stock", "change")
};

/**
 * Category Validation Schemas (Admin)
 */
export const categorySchemas = {
  createCategory: Joi.object({
    name: Joi.string().min(2).max(50).required()
  }),

  updateCategory: Joi.object({
    name: Joi.string().min(2).max(50)
  }),

  toggleStatus: Joi.object({
    isActive: Joi.boolean().required()
  })
};

/**
 * Age Group Validation Schemas (Admin)
 */
export const ageGroupSchemas = {
  createAgeGroup: Joi.object({
    label: Joi.string().required(),
    minAge: Joi.number().integer().min(0).required(),
    maxAge: Joi.number().integer().min(0).required(),
    unit: Joi.string().valid("months", "years").required()
  }).custom((value, helpers) => {
    if (value.maxAge < value.minAge) {
      return helpers.error("any.invalid", { message: "maxAge must be greater than or equal to minAge" });
    }
    return value;
  }),

  updateAgeGroup: Joi.object({
    label: Joi.string(),
    minAge: Joi.number().integer().min(0),
    maxAge: Joi.number().integer().min(0),
    unit: Joi.string().valid("months", "years")
  }),

  toggleStatus: Joi.object({
    isActive: Joi.boolean().required()
  })
};
