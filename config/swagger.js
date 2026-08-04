import swaggerJsdoc from 'swagger-jsdoc';

const serverUrl = process.env.SERVER_URL || '/api';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SiddhuTrends API',
      version: '1.0.0',
      description: 'API documentation for SiddhuTrends E-Commerce Backend',
    },
    servers: [
      {
        url: serverUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Configured server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
        }
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js', './models/*.js'], 
};

export const swaggerSpec = swaggerJsdoc(options);
