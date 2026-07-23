import { hasTenantPermission, Permission, type TenantRole } from '@/server/permissions';

export interface OrderCapabilities {
  canAcceptOrder: boolean;
  canStartPreparation: boolean;
  canMarkReady: boolean;
  canDispatch: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canConfirmPayment: boolean;
  canReviewPayment: boolean;
  canRefundPayment: boolean;
  canViewCustomerContact: boolean;
  canViewPaymentDetails: boolean;
  canViewHistory: boolean;
  canAddInternalNote: boolean;
}

export function getOrderCapabilities(role: TenantRole): OrderCapabilities {
  const canUpdateStatus = hasTenantPermission(role, Permission.UPDATE_ORDER_STATUS);

  return {
    canAcceptOrder: hasTenantPermission(role, Permission.ACCEPT_ORDERS),
    canStartPreparation: canUpdateStatus,
    canMarkReady: canUpdateStatus,
    canDispatch: canUpdateStatus,
    canComplete: hasTenantPermission(role, Permission.COMPLETE_ORDERS),
    canCancel: hasTenantPermission(role, Permission.CANCEL_ORDERS),
    canConfirmPayment: hasTenantPermission(role, Permission.CONFIRM_MANUAL_PAYMENT),
    canReviewPayment: hasTenantPermission(role, Permission.CONFIRM_MANUAL_PAYMENT),
    canRefundPayment: hasTenantPermission(role, Permission.REFUND_PAYMENT),
    canViewCustomerContact: hasTenantPermission(role, Permission.VIEW_CUSTOMER_CONTACT),
    canViewPaymentDetails: hasTenantPermission(role, Permission.VIEW_ORDER_PAYMENT_DETAILS),
    canViewHistory: hasTenantPermission(role, Permission.VIEW_ORDER_HISTORY),
    canAddInternalNote: hasTenantPermission(role, Permission.ADD_INTERNAL_ORDER_NOTE),
  };
}
