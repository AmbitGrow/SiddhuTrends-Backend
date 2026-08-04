import dotenv from "dotenv";

dotenv.config();

const PLACEHOLDER_PATTERNS = [
  "replace_",
  "change_me",
  "your_",
  "<username>",
  "<password>",
  "<database>",
];

const parseTrustProxy = (value) => {
  if (!value) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  const parsedNumber = Number.parseInt(value, 10);
  if (!Number.isNaN(parsedNumber) && parsedNumber >= 0) {
    return parsedNumber;
  }

  throw new Error('TRUST_PROXY must be "true", "false", or a non-negative integer');
};

const isPlaceholder = (value) => {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const validateUrl = (value, { key, requireHttps = false }) => {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  if (requireHttps && parsedUrl.protocol !== "https:") {
    throw new Error(`${key} must use https in production`);
  }
};

const parseMongoReplicaSet = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).searchParams.get("replicaSet");
  } catch {
    return null;
  }
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  mongoReplicaSetName: parseMongoReplicaSet(process.env.MONGO_URI),
  allowedOrigins: [
    process.env.CLIENT_URL,
    process.env.CLIENT_URLS,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
};

export const validateEnv = () => {
  const errors = [];
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  const validNodeEnvs = new Set(["development", "test", "production"]);

  const requireValue = (key, value, options = {}) => {
    if (!value) {
      errors.push(`${key} is required`);
      return;
    }

    if (env.isProduction && isPlaceholder(value)) {
      errors.push(`${key} must not use a placeholder value in production`);
    }

    if (options.minLength && value.length < options.minLength) {
      errors.push(`${key} must be at least ${options.minLength} characters long`);
    }

    if (options.url) {
      try {
        validateUrl(value, { key, requireHttps: options.requireHttps });
      } catch (error) {
        errors.push(error.message);
      }
    }
  };

  if (!validNodeEnvs.has(env.nodeEnv)) {
    errors.push('NODE_ENV must be one of "development", "test", or "production"');
  }

  requireValue("MONGO_URI", process.env.MONGO_URI);
  requireValue("REDIS_URL", redisUrl);
  requireValue("ACCESS_TOKEN_SECRET", process.env.ACCESS_TOKEN_SECRET, {
    minLength: env.isProduction ? 32 : undefined,
  });
  requireValue("REFRESH_TOKEN_SECRET", process.env.REFRESH_TOKEN_SECRET, {
    minLength: env.isProduction ? 32 : undefined,
  });

  if (env.isProduction) {
    requireValue("CLIENT_URL", process.env.CLIENT_URL, {
      url: true,
      requireHttps: true,
    });
    requireValue("CLIENT_URLS", process.env.CLIENT_URLS || process.env.CLIENT_URL, {
      url: true,
      requireHttps: true,
    });
    requireValue("SERVER_URL", process.env.SERVER_URL, {
      url: true,
      requireHttps: true,
    });
    requireValue("RAZORPAY_KEY_ID", process.env.RAZORPAY_KEY_ID);
    requireValue("RAZORPAY_KEY_SECRET", process.env.RAZORPAY_KEY_SECRET, {
      minLength: 16,
    });
    requireValue("RAZORPAY_WEBHOOK_SECRET", process.env.RAZORPAY_WEBHOOK_SECRET, {
      minLength: 16,
    });
  }

  if (process.env.PORT && Number.isNaN(Number.parseInt(process.env.PORT, 10))) {
    errors.push("PORT must be a valid integer");
  }

  if (process.env.PORT) {
    const parsedPort = Number.parseInt(process.env.PORT, 10);
    if (parsedPort < 1 || parsedPort > 65535) {
      errors.push("PORT must be between 1 and 65535");
    }
  }

  if (env.allowedOrigins.length === 0) {
    errors.push("At least one allowed client origin must be configured");
  }

  if (!env.mongoReplicaSetName) {
    errors.push("MONGO_URI must include a replicaSet query parameter");
  }

  env.allowedOrigins.forEach((origin) => {
    try {
      validateUrl(origin, { key: "CLIENT_URLS", requireHttps: env.isProduction });
    } catch (error) {
      errors.push(error.message);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }
};
