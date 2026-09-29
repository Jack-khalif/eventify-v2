import { publicEvents } from '@eventify/shared/fixtures';
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { seedDemoTicket } from './orders';

seedDemoTicket(publicEvents());

export const worker = setupWorker(...handlers);
