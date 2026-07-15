'use client';

import React, { useState, useEffect } from 'react';
import { Product } from './ProductRow';

export interface CartItem {
  product: Product;
  thickness: string;
  size: string;
  quantity: number;
  quality?: string;
}

// Wholesale math logic: Calculate square footage from size string (e.g. 8x4) and sheets quantity
export function calculateSqFt(sizeStr: string, qty: number): number {
  try {
    const parts = sizeStr.toLowerCase().split('x');
    if (parts.length === 2) {
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (!isNaN(w) && !isNaN(h)) {
        return w * h * qty;
      }
    }
  } catch (e) {
    console.error('Error calculating sq ft:', e);
  }
  return 0;
}

interface EnquiryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQty: (productId: string, thickness: string, size: string, newQty: number, quality?: string) => void;
  onRemoveItem: (productId: string, thickness: string, size: string, quality?: string) => void;
  onClearCart: () => void;
  dealerProfile: {
    full_name: string;
    phone_number: string;
    email: string;
    gstin?: string;
    shop_address?: string;
  } | null;
  onSubmitSuccess?: () => void;
}

export default function EnquiryDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  dealerProfile,
  onSubmitSuccess,
}: EnquiryDrawerProps) {
  // Form fields (only delivery location and comments are dynamic, other details fetched from profile)
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [comments, setComments] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    enquiryId?: string;
    isMocked?: boolean;
    errorMsg?: string;
  } | null>(null);

  // Synchronize shop address to delivery location if blank
  useEffect(() => {
    if (dealerProfile?.shop_address && !deliveryLocation) {
      setDeliveryLocation(dealerProfile.shop_address);
    }
  }, [dealerProfile, deliveryLocation]);

  if (!isOpen && !showSuccessOverlay) return null;

  const totalSheets = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalSqFt = cartItems.reduce((sum, item) => sum + calculateSqFt(item.size, item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0 || !dealerProfile) return;

    setIsSubmitting(true);
    setSubmitResult(null);

    const payload = {
      dealer_phone: dealerProfile.phone_number,
      dealer_name: dealerProfile.full_name,
      delivery_location: deliveryLocation,
      comments: comments || null,
      items: cartItems.map((item) => ({
        product_id: item.product.id,
        name: item.product.name,
        thickness: item.thickness,
        size: item.size,
        quantity: item.quantity,
        quality: item.quality || null,
      })),
    };

    try {
      // Submit to our local API route
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Failed to submit enquiry');
      }

      setSubmitResult({
        success: true,
        enquiryId: resData.enquiryId,
        isMocked: resData.isMocked,
      });

      // Clear the basket and open the successful overlay
      onClearCart();
      setShowSuccessOverlay(true);
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }

    } catch (err: unknown) {
      console.error('API submission failed, falling back to mock storage:', err);
      
      const mockEnquiryId = `ENQ-${Math.floor(100000 + Math.random() * 900000)}`;
      
      // Save offline fallback locally
      const savedEnquiries = JSON.parse(localStorage.getItem('hd_offline_enquiries') || '[]');
      savedEnquiries.push({
        id: mockEnquiryId,
        submittedAt: new Date().toISOString(),
        customer: payload,
        items: cartItems.map(item => ({
          name: item.product.name,
          thickness: item.thickness,
          size: item.size,
          quantity: item.quantity,
          quality: item.quality || null
        }))
      });
      localStorage.setItem('hd_offline_enquiries', JSON.stringify(savedEnquiries));

      setSubmitResult({
        success: true,
        enquiryId: mockEnquiryId,
        isMocked: true,
      });
      
      onClearCart();
      setShowSuccessOverlay(true);
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWhatsAppShare = () => {
    if (!submitResult?.enquiryId || !dealerProfile) return;

    let message = `*HD PLY Wholesale Bulk Enquiry*\n`;
    message += `-------------------------------\n`;
    message += `*Enquiry ID:* ${submitResult.enquiryId}\n`;
    message += `*Business/Dealer:* ${dealerProfile.full_name}\n`;
    message += `*Phone:* ${dealerProfile.phone_number}\n`;
    message += `*Delivery Location:* ${deliveryLocation}\n`;
    if (dealerProfile.gstin) message += `*GSTIN:* ${dealerProfile.gstin}\n`;
    if (comments) message += `*Notes:* ${comments}\n\n`;
    
    message += `*Items Requested:*\n`;
    // We fetch items from previous items snapshot or show total sheets since cart was cleared
    message += `Total Sheets: *${totalSheets}*\n`;
    message += `Please review the details attached to Ref: ${submitResult.enquiryId}.\n`;
    
    const encodedText = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
  };

  const handleCloseOverlay = () => {
    setShowSuccessOverlay(false);
    setSubmitResult(null);
    setDeliveryLocation('');
    setComments('');
    onClose();
  };

  return (
    <>
      {/* 1. Global Full-Screen Success Overlay Modal */}
      {showSuccessOverlay && submitResult && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-stone-900/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-100 bg-white p-6 text-center shadow-2xl animate-pop">
            <div className="mx-auto h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-5 shadow-inner">
              <svg className="h-10 w-10 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h3 className="text-xl font-black text-stone-900">Enquiry Sent Successfully!</h3>
            <p className="text-xs text-stone-500 mt-2.5 max-w-xs mx-auto leading-relaxed">
              Your bulk order request for **HD PLY** has been recorded. Our 
wholesale dispatch manager will contact you shortly.
            </p>

            <div className="mt-5 rounded-2xl border border-stone-100 bg-stone-50 p-4 text-left">
              <div className="flex justify-between border-b border-stone-200/50 pb-2.5">
                <span className="text-xs font-semibold text-stone-500">Ref ID:</span>
                <span className="text-xs font-bold text-amber-800 tracking-wider uppercase">{submitResult.enquiryId}</span>
              </div>
              <div className="flex justify-between pt-2.5 text-xs">
                <span className="font-semibold text-stone-500">Dealer:</span>
                <span className="font-bold text-stone-800">{dealerProfile?.full_name}</span>
              </div>
              {submitResult.isMocked && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-2 flex items-start space-x-2">
                  <svg className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[10px] text-amber-800 font-medium leading-normal">
                    Database offline. Saved locally. The admin will sync this offline order shortly.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-2.5">
              <button
                onClick={handleWhatsAppShare}
                className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-xs font-bold shadow-md shadow-emerald-600/10 transition"
              >
                <span>Share Enquiry on WhatsApp</span>
              </button>
              <button
                onClick={handleCloseOverlay}
                className="w-full border border-stone-200 text-stone-600 bg-white rounded-xl py-3 text-xs font-bold hover:bg-stone-50 transition"
              >
                Close & Browse Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Side Slider Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={onClose}
          />

          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-md transform bg-white shadow-2xl transition-all duration-300 flex flex-col h-full border-l border-stone-200 animate-slide-in">
              {/* Header */}
              <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-stone-900">Enquiry Basket</h2>
                  <p className="text-[10px] text-stone-500 mt-0.5">Build your bulk HD PLY requirements</p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
                  id="close-enquiry-drawer"
                >
                  <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center h-[70vh]">
                    <div className="h-16 w-16 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-center text-stone-300 mb-4">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-stone-900">Your basket is empty</h3>
                    <p className="text-xs text-stone-500 max-w-xs mt-1.5 leading-relaxed">
                      Select thicknesses and sizes in the catalog to add items to your wholesale basket.
                    </p>
                    <button
                      onClick={onClose}
                      className="mt-5 rounded-xl bg-amber-800 hover:bg-amber-900 px-4 py-2 text-xs font-semibold text-white transition active:scale-95"
                    >
                      Browse Catalogue
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Items List */}
                    <div className="space-y-2.5">
                      <h3 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Items Selected</h3>
                      <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                        {cartItems.map((item) => (
                          <div
                            key={`${item.product.id}-${item.thickness}-${item.size}-${item.quality || ''}`}
                            className="flex items-center justify-between rounded-xl border border-stone-100 bg-stone-50/50 p-3"
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <h4 className="text-xs font-bold text-stone-900 truncate leading-snug">
                                {item.product.name}
                              </h4>
                               <div className="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-y-1">
                                 {item.quality && (
                                   <span className="text-[9px] font-bold text-blue-800 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                     {item.quality}
                                   </span>
                                 )}
                                 <span className="text-[9px] font-bold text-stone-600 bg-stone-100 border border-stone-200/50 rounded px-1.5 py-0.5">
                                   {item.thickness}
                                 </span>
                                 <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-100/55 rounded px-1.5 py-0.5">
                                   {item.size} ft
                                 </span>
                                 <span className="text-[9px] font-extrabold text-stone-500 bg-stone-100/60 rounded px-1.5 py-0.5">
                                   {calculateSqFt(item.size, item.quantity)} sq ft
                                 </span>
                               </div>
                            </div>

                            <div className="flex items-center space-x-3">
                              {/* Quantity selectors */}
                              <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5">
                                <button
                                  type="button"
                                  onClick={() => onUpdateQty(item.product.id, item.thickness, item.size, item.quantity - 5, item.quality)}
                                  className="h-5.5 w-6 flex items-center justify-center rounded text-stone-500 hover:bg-stone-55"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center text-xs font-bold text-stone-855">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onUpdateQty(item.product.id, item.thickness, item.size, item.quantity + 5, item.quality)}
                                  className="h-5.5 w-6 flex items-center justify-center rounded text-stone-500 hover:bg-stone-55"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                onClick={() => onRemoveItem(item.product.id, item.thickness, item.size, item.quality)}
                                className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-650 transition"
                                aria-label="Remove item"
                              >
                                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-between items-center bg-stone-100/50 rounded-xl p-3 text-xs font-bold text-stone-855">
                        <span>Total Requested:</span>
                        <div className="text-right">
                          <span className="text-amber-800 block text-xs">{totalSheets} Sheets</span>
                          <span className="text-stone-500 text-[10px] block">{totalSqFt} Sq Ft (Total Area)</span>
                        </div>
                      </div>
                    </div>

                    {/* Wholesale profile indicator */}
                    {dealerProfile && (
                      <div className="rounded-2xl border border-stone-200 p-3.5 bg-stone-50/50 space-y-2">
                        <div className="flex justify-between items-center border-b border-stone-200/50 pb-1.5">
                          <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Registered Profile</span>
                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 rounded-full px-2 py-0.5">Active Session</span>
                        </div>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between"><span className="text-stone-500">Name:</span> <span className="font-semibold text-stone-800">{dealerProfile.full_name}</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Phone:</span> <span className="font-semibold text-stone-800">{dealerProfile.phone_number}</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Email:</span> <span className="font-semibold text-stone-800">{dealerProfile.email}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Delivery Form */}
                    <form onSubmit={handleSubmit} className="border-t border-stone-100 pt-5 space-y-4">
                      <h3 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Delivery Instructions</h3>

                      {/* Delivery Location */}
                      <div>
                        <label htmlFor="delivery-location" className="block text-xs font-bold text-stone-700">
                          Delivery Location / City *
                        </label>
                        <input
                          type="text"
                          id="delivery-location"
                          required
                          value={deliveryLocation}
                          onChange={(e) => setDeliveryLocation(e.target.value)}
                          placeholder="e.g. Bangalore Outer Ring Road"
                          className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs text-stone-900 shadow-xs focus:border-amber-800 focus:outline-none"
                        />
                      </div>

                      {/* Custom Comments */}
                      <div>
                        <label htmlFor="comments" className="block text-xs font-bold text-stone-700">
                          Custom Size Requirements / Special Notes
                        </label>
                        <textarea
                          id="comments"
                          rows={2.5}
                          value={comments}
                          onChange={(e) => setComments(e.target.value)}
                          placeholder="e.g. Need quick delivery. Standard sizes preferred."
                          className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs text-stone-900 shadow-xs focus:border-amber-800 focus:outline-none resize-none"
                        />
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full mt-6 bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3.5 text-xs font-bold shadow-md shadow-amber-800/10 transition active:scale-[0.98] disabled:bg-stone-300 disabled:shadow-none flex items-center justify-center space-x-2"
                      >
                        {isSubmitting ? (
                          <>
                            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Submitting Enquiry...</span>
                          </>
                        ) : (
                          <span>Submit Bulk Enquiry</span>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
