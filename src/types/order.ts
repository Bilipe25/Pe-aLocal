import type { Prisma } from '@prisma/client';

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        options: true;
      };
    };
    payment: true;
    statusHistory: true;
  };
}>;
