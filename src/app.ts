import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS ?? '*';
const corsOptions =
  allowedOrigins === '*'
    ? { origin: '*' }
    : { origin: allowedOrigins.split(',').map((o) => o.trim()) };

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.use(router);

app.use(errorHandler);

export default app;
