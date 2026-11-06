import { Injectable } from '@nestjs/common';

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
}

@Injectable()
export class BillingService {
  listPlans(): Plan[] {
    return [
      { id: 'starter', name: 'Starter', price: 29, currency: 'USD', features: ['1 social account', '5 scheduled posts'] },
      { id: 'growth', name: 'Growth', price: 79, currency: 'USD', features: ['3 social accounts', '50 scheduled posts', 'Analytics'] },
      { id: 'agency', name: 'Agency', price: 199, currency: 'USD', features: ['unlimited accounts', 'unlimited posts', 'Team seats', 'Priority queue'] },
    ];
  }

  async getSubscription(_userId: string) {
    // Stripe integration point — retorna estado atual
    return { status: 'active', planId: 'growth', renewsAt: null };
  }

  async subscribe(_planId: string, _userId: string) {
    // Stripe checkout session mock
    return { status: 'active', planId: _planId };
  }
}
