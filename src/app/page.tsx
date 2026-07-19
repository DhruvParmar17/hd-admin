'use client';

import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabaseClient';
import html2canvas from 'html2canvas';

interface Dealer {
  id: string;
  full_name: string;
  phone_number: string;
  email: string;
  gstin?: string;
  shop_address?: string;
  device_registered?: boolean;
  created_at: string;
  status?: string;
}

interface EnquiryItem {
  id: string;
  product_name?: string;
  product_id?: string;
  thickness: string;
  size: string;
  quantity: number;
  quality?: string;
  rate?: number;
}

interface Enquiry {
  id: string;
  dealer_name: string;
  dealer_phone: string;
  company_name?: string;
  delivery_location: string;
  comments?: string;
  status: string;
  billed_amount?: number | null;
  payment_status?: string;
  created_at: string;
  enquiry_items?: EnquiryItem[];
}

// Parse dimensions e.g. "8x4" into length: 8, width: 4
function parseDimensions(sizeStr: string): { length: number; width: number } {
  try {
    const parts = sizeStr.toLowerCase().split('x');
    if (parts.length === 2) {
      const l = parseFloat(parts[0]);
      const w = parseFloat(parts[1]);
      if (!isNaN(l) && !isNaN(w)) {
        return { length: l, width: w };
      }
    }
  } catch (e) {
    console.error('Error parsing size string:', e);
  }
  return { length: 0, width: 0 };
}

// Convert length to metres
function convertLengthToMetre(length: number): number {
  if (length === 8) return 2.44;
  if (length === 7) return 2.14;
  if (length === 6) return 1.84;
  if (length === 5) return 0.465;
  return length * 0.3048;
}

// Convert width to metres
function convertWidthToMetre(width: number): number {
  if (width === 4) return 1.22;
  if (width === 3) return 0.92;
  return width * 0.3048;
}

// Wholesale math helper: Calculate square footage from size string and quantity
function calculateSqFt(sizeStr: string, qty: number): number {
  const { length, width } = parseDimensions(sizeStr);
  return length * width * qty;
}

let sharedAudioCtx: AudioContext | null = null;

function initAudioContext() {
  if (typeof window !== 'undefined' && !sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
}

// Play notification sound using browser Web Audio API oscillator synthesis (repeats for loud alarm)
function playLoudAlarm() {
  try {
    initAudioContext();
    const ctx = sharedAudioCtx;
    if (!ctx) return;

    const playChimeTone = (delay: number, freq1: number, freq2: number) => {
      // Bell Tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq1, ctx.currentTime + delay);
      gain1.gain.setValueAtTime(0.45, ctx.currentTime + delay);
      gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime + delay);
      osc1.stop(ctx.currentTime + delay + 0.6);

      // Bell Tone 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq2, ctx.currentTime + delay + 0.15);
      gain2.gain.setValueAtTime(0.35, ctx.currentTime + delay + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + delay + 0.15);
      osc2.stop(ctx.currentTime + delay + 0.8);
    };

    // Play 3 times in a row for high-priority notification (A5 -> E6 chime)
    playChimeTone(0, 880.00, 1318.51); 
    playChimeTone(0.5, 880.00, 1318.51);
    playChimeTone(1.0, 880.00, 1318.51);

    // Native hardware vibration sequence if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([400, 150, 400]); // Sharp double pulse vibration pattern
    }
  } catch (e) {
    console.error('Failed to play alarm chime:', e);
  }
}

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  // Audio system unlock trigger
  useEffect(() => {
    const unlock = () => {
      initAudioContext();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('touchstart', unlock);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };
  }, []);

  // Data states
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Stats
  const [totalDealers, setTotalDealers] = useState(0);
  const [activeSessions, setActiveSessions] = useState(0);
  const [pendingEnquiries, setPendingEnquiries] = useState(0);
  const [totalSheetsRequested, setTotalSheetsRequested] = useState(0);

  // Admin Dashboard views (Separate Power Tabs)
  const [activeAdminTab, setActiveAdminTab] = useState<'enquiries' | 'dealers' | 'ledger'>('enquiries');

  // Visual Banner Notification Alert state
  const [newEnquiryAlert, setNewEnquiryAlert] = useState<{
    visible: boolean;
    dealerName?: string;
    id?: string;
  }>({ visible: false });

  // --- BILLING MODULE STATES ---
  const [activeBillingEnquiry, setActiveBillingEnquiry] = useState<Enquiry | null>(null);
  const [billingMode, setBillingMode] = useState<'Feet' | 'Metre'>('Feet');
  const [itemRates, setItemRates] = useState<{ [itemId: string]: number }>({});
  const [addTransport, setAddTransport] = useState(false);
  const [transportFee, setTransportFee] = useState(0);
  const [addGst, setAddGst] = useState(false);
  
  // Invoicing Draft Preview States
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [draftCustomNotes, setDraftCustomNotes] = useState('');
  const [finalGrandTotal, setFinalGrandTotal] = useState(0);
  const [isBillFinalized, setIsBillFinalized] = useState(false);
  const [isCapturingBill, setIsCapturingBill] = useState(false);
  const invoiceCaptureRef = useRef<HTMLDivElement>(null);

  // --- LEDGER WORKSPACE STATES ---
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [selectedLedgerDealer, setSelectedLedgerDealer] = useState<Dealer | null>(null);

  // Goods Return Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnEnquiryId, setReturnEnquiryId] = useState('');
  const [returnOriginalBilledAmount, setReturnOriginalBilledAmount] = useState(0);
  const [returnTransportCost, setReturnTransportCost] = useState(0);
  const [returnItems, setReturnItems] = useState<{ itemId: string; returnedQty: number; name: string; thickness: string; size: string; rate: number; maxQty: number }[]>([]);

  // Bill History Date Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledgerSubTab, setLedgerSubTab] = useState<'parties' | 'bill_history'>('parties');

  // --- WORKFLOW STATUS FILTER STATES ---
  const [workflowFilter, setWorkflowFilter] = useState<'All' | 'Pending' | 'LeftToSend' | 'Sent' | 'Cancelled'>('All');
  const [activeFollowUpId, setActiveFollowUpId] = useState<string | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);

  // --- MANUAL PAYMENT LOGGING FORM STATES ---
  const [refBillId, setRefBillId] = useState<string>('advance');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isAdvance, setIsAdvance] = useState<boolean>(true);

  // --- ALTER ENTRY MODULE STATES ---
  const [alterModalOpen, setAlterModalOpen] = useState(false);
  const [alterEnquiryId, setAlterEnquiryId] = useState('');
  const [alterDealerName, setAlterDealerName] = useState('');
  const [alterDealerPhone, setAlterDealerPhone] = useState('');
  const [alterDeliveryLocation, setAlterDeliveryLocation] = useState('');
  const [alterComments, setAlterComments] = useState('');
  const [alterStatus, setAlterStatus] = useState('');
  const [alterPaymentStatus, setAlterPaymentStatus] = useState('');
  const [alterBilledAmount, setAlterBilledAmount] = useState<number | null>(null);
  const [alterItems, setAlterItems] = useState<{ id: string; product_name: string; thickness: string; size: string; quantity: number; rate: number }[]>([]);

  // --- NOTIFICATION PERMISSION STATE ---
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const pendingAlarms = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const registerAndSubscribePush = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }
    try {
      console.log('Registering sw.js service worker...');
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered successfully:', registration);

      // Wait for service worker to become active
      let serviceWorker = registration.active || registration.waiting || registration.installing;
      if (!serviceWorker) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (registration.active) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      // Public VAPID Key
      const vapidPublicKey = 'BPqkSmNZWLP4Obdep1u-7LcxvNLueK8-NvaS6Yb1FQgkJsWt8h3m6UWcEZg4ema1uUzBwTKJN4b-FLad9DY4XnY';
      
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

      console.log('Subscribing to Push Manager...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });

      console.log('Push subscription generated successfully:', subscription);

      // Save push subscription to Supabase admin_subscriptions
      const { error: dbError } = await supabase
        .from('admin_subscriptions')
        .upsert({
          endpoint: subscription.endpoint,
          keys: JSON.parse(JSON.stringify(subscription.toJSON().keys))
        }, { onConflict: 'endpoint' });

      if (dbError) {
        console.error('Failed to store push subscription in Supabase:', dbError);
      } else {
        console.log('Successfully saved push subscription to Supabase!');
      }
    } catch (err) {
      console.error('Failed to register service worker or subscribe to push alerts:', err);
    }
  };

  const requestNotificationPermission = () => {
    // 1. Initialize or resume browser AudioContext to clear silent user-gesture lock
    initAudioContext();
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    // 2. Play short test alarm chime
    playLoudAlarm();

    // 3. Update local audio status state
    setIsAudioEnabled(true);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          registerAndSubscribePush();
        }
      });
    }
  };
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === 'Vply@1') {
      setIsAuthenticated(true);
      setPasscodeError('');
      sessionStorage.setItem('hd_admin_auth', 'true');
    } else {
      setPasscodeError('Invalid passcode. Security gate blocked.');
    }
  };

  useEffect(() => {
    const isAuthed = sessionStorage.getItem('hd_admin_auth');
    if (isAuthed === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Request HTML5 Notifications permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Standalone Push Service Worker subscriber triggers after successful passcode authentication
  useEffect(() => {
    if (isAuthenticated) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        Notification.requestPermission().then((permission) => {
          setNotificationPermission(permission);
          if (permission === 'granted') {
            registerAndSubscribePush();
          }
        });
      }
    }
  }, [isAuthenticated]);

  // Fetch data function
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Dealers
      const { data: dbDealers, error: dealersErr } = await supabase
        .from('dealers')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealersErr) throw dealersErr;

      // 2. Fetch Enquiries with join on items and products
      const { data: dbEnquiries, error: enqErr } = await supabase
        .from('enquiries')
        .select('*, enquiry_items(*, products(name))')
        .order('created_at', { ascending: false });

      if (enqErr) throw enqErr;

      // Map database enquiries
      const mappedEnquiries: Enquiry[] = (dbEnquiries || []).map((enq) => {
        const registeredDealer = (dbDealers || []).find(
          (d) => d.phone_number === enq.dealer_phone
        );
        return {
          id: enq.id,
          dealer_name: registeredDealer ? registeredDealer.full_name : enq.dealer_name,
          dealer_phone: registeredDealer ? registeredDealer.phone_number : enq.dealer_phone,
          company_name: enq.company_name,
          delivery_location: enq.delivery_location,
          comments: enq.comments,
          status: enq.status,
          billed_amount: enq.billed_amount,
          payment_status: enq.payment_status || 'Pending',
          created_at: enq.created_at,
          enquiry_items: (enq.enquiry_items || []).map((item: any) => ({
            id: item.id,
            product_name: item.products?.name || 'Plywood / Laminate',
            product_id: item.product_id,
            thickness: item.thickness,
            size: item.size,
            quantity: item.quantity,
            quality: item.quality,
            rate: item.rate || 0,
          })),
        };
      });

      setDealers(dbDealers || []);
      setEnquiries(mappedEnquiries);
      setIsDemoMode(false);
    } catch (err) {
      console.error('Admin Supabase fetch failed:', err);
      setDealers([]);
      setEnquiries([]);
      setIsDemoMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  // Set up real-time postgres changes listener
  useEffect(() => {
    if (!isAuthenticated) return;

    console.log('Registering Supabase Realtime channel for enquiries...');
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'enquiries' },
        (payload) => {
          console.log('Real-time database insert event received:', payload);
          if (payload.new.status === 'Cancelled') return;

          const elapsed = (Date.now() - new Date(payload.new.created_at).getTime()) / 1000;
          const remainingMs = Math.max(0, (30 - elapsed) * 1000);

          console.log(`Scheduling alarm for enquiry ${payload.new.id} in ${remainingMs}ms...`);

          // Clear any existing timeout for this ID
          if (pendingAlarms.current[payload.new.id]) {
            clearTimeout(pendingAlarms.current[payload.new.id]);
          }

          pendingAlarms.current[payload.new.id] = setTimeout(async () => {
            delete pendingAlarms.current[payload.new.id];

            // Verify the status is not Cancelled in the database
            try {
              const { data, error } = await supabase
                .from('enquiries')
                .select('status')
                .eq('id', payload.new.id)
                .maybeSingle();

              if (data && data.status === 'Cancelled') {
                console.log('Enquiry was cancelled during countdown. Alarm skipped.');
                return;
              }
            } catch (e) {
              console.error('Failed to verify enquiry cancellation state:', e);
            }

            // 1. Force the new order card to instantly snap onto the visible dashboard
            const newEnq: Enquiry = {
              id: payload.new.id,
              dealer_name: payload.new.dealer_name,
              dealer_phone: payload.new.dealer_phone,
              company_name: payload.new.company_name,
              delivery_location: payload.new.delivery_location,
              comments: payload.new.comments || '',
              status: payload.new.status,
              billed_amount: payload.new.billed_amount || null,
              payment_status: payload.new.payment_status || 'Pending',
              created_at: payload.new.created_at,
              enquiry_items: []
            };

            setEnquiries((prev) => {
              if (prev.some((e) => e.id === newEnq.id)) return prev;
              return [newEnq, ...prev];
            });

            // 2. Fire the native audio chime and device vibration side-effects here
            playLoudAlarm();
            if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
              window.navigator.vibrate([200, 100, 200]);
            }

            // Show HTML5 native push notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New Live HD PLY Order!', {
                body: `Incoming enquiry from ${payload.new.dealer_name}.`,
                icon: '/favicon.ico'
              });
            }

            // Set visual alert banner
            setNewEnquiryAlert({
              visible: true,
              dealerName: payload.new.dealer_name,
              id: payload.new.id,
            });

            // Reload all lists after exactly 800ms to pull joined product items safely
            setTimeout(() => {
              fetchData();
            }, 800);
          }, remainingMs);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'enquiries' },
        (payload) => {
          if (payload.new.status === 'Cancelled') {
            console.log('Real-time database update event received: Enquiry Cancelled.', payload.new.id);
            if (pendingAlarms.current[payload.new.id]) {
              clearTimeout(pendingAlarms.current[payload.new.id]);
              delete pendingAlarms.current[payload.new.id];
              console.log('Pending alarm timeout cleared for cancelled enquiry.');
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Supabase Realtime socket status:', status);
      });

    return () => {
      // Clean up all pending timeouts
      Object.values(pendingAlarms.current).forEach(clearTimeout);
      pendingAlarms.current = {};
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  // Compute stats
  useEffect(() => {
    setTotalDealers(dealers.length);
    setActiveSessions(dealers.filter((d) => d.device_registered === true).length);
    setPendingEnquiries(enquiries.filter((e) => e.status.toLowerCase() === 'pending').length);
    
    const totalSheets = enquiries.reduce((sum, enq) => {
      const itemsSum = (enq.enquiry_items || []).reduce((iSum, item) => iSum + item.quantity, 0);
      return sum + itemsSum;
    }, 0);
    setTotalSheetsRequested(totalSheets);
  }, [dealers, enquiries]);

  // --- DYNAMIC ACTIONS PANEL ON CARDS ---
  const handleUpdateStatus = async (enquiryId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('enquiries')
        .update({ status: newStatus })
        .eq('id', enquiryId);

      if (error) throw error;

      setEnquiries((prev) =>
        prev.map((e) => (e.id === enquiryId ? { ...e, status: newStatus } : e))
      );
    } catch (err) {
      console.error('Failed to update status in database:', err);
    }
  };

  const handleTogglePaymentStatus = async (enquiryId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Paid' ? 'Pending' : 'Paid';
    try {
      const { error } = await supabase
        .from('enquiries')
        .update({ payment_status: nextStatus })
        .eq('id', enquiryId);

      if (error) throw error;

      setEnquiries((prev) =>
        prev.map((e) => (e.id === enquiryId ? { ...e, payment_status: nextStatus } : e))
      );
    } catch (err) {
      console.error('Failed to update payment status:', err);
    }
  };

  const handleReturnGoods = async (
    enquiryId: string, 
    itemsToReturn: { itemId: string; returnedQty: number; name: string; thickness: string; size: string; rate: number; maxQty?: number }[], 
    returnTransport: number, 
    originalBilledAmount: number
  ) => {
    try {
      let itemsDeduction = 0;
      for (const returnItem of itemsToReturn) {
        if (returnItem.returnedQty <= 0) continue;
        const isLaminate = returnItem.name.toLowerCase().includes('laminate');
        if (isLaminate) {
          itemsDeduction += returnItem.returnedQty * returnItem.rate;
        } else {
          const { length, width } = parseDimensions(returnItem.size);
          const area = length * width;
          itemsDeduction += area * returnItem.returnedQty * returnItem.rate;
        }
      }

      const totalDeduction = itemsDeduction + returnTransport;
      const newBilledAmount = Math.max(0, originalBilledAmount - totalDeduction);

      const { error: enqError } = await supabase
        .from('enquiries')
        .update({ billed_amount: newBilledAmount })
        .eq('id', enquiryId);

      if (enqError) throw enqError;

      for (const returnItem of itemsToReturn) {
        if (returnItem.returnedQty <= 0) continue;
        const originalItem = (enquiries.find(e => e.id === enquiryId)?.enquiry_items || []).find(i => i.id === returnItem.itemId);
        if (!originalItem) continue;
        const newQty = Math.max(0, originalItem.quantity - returnItem.returnedQty);

        if (newQty === 0) {
          const { error: itemErr } = await supabase
            .from('enquiry_items')
            .delete()
            .eq('id', returnItem.itemId);
          if (itemErr) throw itemErr;
        } else {
          const { error: itemErr } = await supabase
            .from('enquiry_items')
            .update({ quantity: newQty })
            .eq('id', returnItem.itemId);
          if (itemErr) throw itemErr;
        }
      }

      await fetchData();
      alert('Goods returned successfully! Balance updated.');
    } catch (err) {
      console.error('Failed to return goods:', err);
      alert('Failed to process goods return. Please verify your connection.');
    }
  };

  const openReturnGoodsModal = (enq: Enquiry) => {
    setReturnEnquiryId(enq.id);
    setReturnOriginalBilledAmount(enq.billed_amount || 0);
    setReturnTransportCost(0);
    
    const items = (enq.enquiry_items || []).map((item) => ({
      itemId: item.id,
      returnedQty: 0,
      name: item.product_name || 'Plywood',
      thickness: item.thickness,
      size: item.size,
      rate: item.rate || 0,
      maxQty: item.quantity,
    }));
    setReturnItems(items);
    setReturnModalOpen(true);
  };

  const handleDeleteEnquiry = async (enquiryId: string) => {
    if (!window.confirm('Are you absolutely sure you want to permanently delete this wholesale enquiry from the database?')) return;
    try {
      const { error } = await supabase
        .from('enquiries')
        .delete()
        .eq('id', enquiryId);

      if (error) throw error;
      setEnquiries((prev) => prev.filter((e) => e.id !== enquiryId));
    } catch (err) {
      console.error('Failed to delete enquiry:', err);
    }
  };

  const handleOpenBilling = (enq: Enquiry) => {
    setActiveBillingEnquiry(enq);
    setBillingMode('Feet');
    const initialRates: { [itemId: string]: number } = {};
    (enq.enquiry_items || []).forEach((item) => {
      initialRates[item.id] = 0;
    });
    setItemRates(initialRates);
    setAddTransport(false);
    setTransportFee(0);
    setAddGst(false);
    setShowDraftPreview(false);
    setIsBillFinalized(false);
    setDraftCustomNotes('');
  };

  const getDealerOutstandingBalance = (dealerPhone: string) => {
    const totalBilled = enquiries
      .filter((e) => e.dealer_phone === dealerPhone && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid')
      .reduce((sum, e) => sum + (e.billed_amount || 0), 0);

    const savedLogs = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('hd_payment_logs') || '[]') : [];
    const dealerPayments = savedLogs
      .filter((p: any) => p.dealer_phone === dealerPhone && p.reference_bill_id === 'advance')
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    return Math.max(0, totalBilled - dealerPayments);
  };

  const handleLogPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }
    if (!selectedLedgerDealer) return;

    try {
      const paymentLog = {
        id: `PAY-${Math.floor(100000 + Math.random() * 900000)}`,
        dealer_phone: selectedLedgerDealer.phone_number,
        dealer_name: selectedLedgerDealer.full_name,
        reference_bill_id: isAdvance ? 'advance' : refBillId,
        amount,
        created_at: new Date().toISOString()
      };

      const savedLogs = JSON.parse(localStorage.getItem('hd_payment_logs') || '[]');
      savedLogs.push(paymentLog);
      localStorage.setItem('hd_payment_logs', JSON.stringify(savedLogs));

      if (!isAdvance && refBillId && refBillId !== 'advance') {
        const { error } = await supabase
          .from('enquiries')
          .update({ payment_status: 'Paid' })
          .eq('id', refBillId);
        if (error) throw error;
      }

      setPaymentAmount('');
      const unpaid = enquiries.find((e) => e.dealer_phone === selectedLedgerDealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid');
      setRefBillId(unpaid ? unpaid.id : 'advance');
      setIsAdvance(unpaid ? false : true);

      await fetchData();
      alert("Payment entry logged successfully!");
    } catch (err) {
      console.error("Failed to log payment:", err);
    }
  };

  const handleDeletePayment = async (payId: string) => {
    if (!window.confirm("Are you sure you want to delete this payment entry?")) return;
    const logs = JSON.parse(localStorage.getItem('hd_payment_logs') || '[]');
    const filtered = logs.filter((l: any) => l.id !== payId);
    localStorage.setItem('hd_payment_logs', JSON.stringify(filtered));
    await fetchData();
  };

  const handleReorderAdmin = async (enq: Enquiry) => {
    if (!window.confirm("Are you sure you want to clone and Order Again?")) return;
    try {
      const { data: newEnq, error: eErr } = await supabase
        .from('enquiries')
        .insert([
          {
            dealer_phone: enq.dealer_phone,
            dealer_name: enq.dealer_name,
            delivery_location: enq.delivery_location,
            comments: `Re-ordered from Ref: ${enq.id.substring(0, 8).toUpperCase()}`,
            status: 'Pending',
            payment_status: 'Pending'
          }
        ])
        .select()
        .single();

      if (eErr) throw eErr;

      const newItems = (enq.enquiry_items || []).map((item) => ({
        enquiry_id: newEnq.id,
        product_id: item.product_id,
        thickness: item.thickness,
        size: item.size,
        quantity: item.quantity,
        quality: item.quality,
        rate: item.rate || 0
      }));

      const { error: iErr } = await supabase
        .from('enquiry_items')
        .insert(newItems);

      if (iErr) throw iErr;

      await fetchData();
      alert(`New enquiry created successfully as Ref: ${newEnq.id.substring(0, 8).toUpperCase()}`);
    } catch (err) {
      console.error('Failed to auto-reorder enquiry:', err);
    }
  };

  const openAlterPaymentModal = (pay: any) => {
    setAlterEnquiryId(pay.id);
    setAlterDealerPhone(pay.dealer_phone);
    setAlterDealerName(pay.dealer_name);
    setAlterStatus('PAYMENT');
    setAlterBilledAmount(pay.amount);
    setAlterComments(pay.reference_bill_id);
    setAlterModalOpen(true);
  };

  const handleSaveAlterPayment = () => {
    const logs = JSON.parse(localStorage.getItem('hd_payment_logs') || '[]');
    const updated = logs.map((l: any) => {
      if (l.id === alterEnquiryId) {
        return {
          ...l,
          amount: alterBilledAmount || 0,
          reference_bill_id: alterComments
        };
      }
      return l;
    });
    localStorage.setItem('hd_payment_logs', JSON.stringify(updated));
    setAlterModalOpen(false);
    fetchData();
    alert("Payment transaction entry updated successfully!");
  };

  const openAlterEnquiryModal = (enq: Enquiry) => {
    setAlterEnquiryId(enq.id);
    setAlterDealerName(enq.dealer_name);
    setAlterDealerPhone(enq.dealer_phone);
    setAlterDeliveryLocation(enq.delivery_location);
    setAlterComments(enq.comments || '');
    setAlterStatus(enq.status);
    setAlterPaymentStatus(enq.payment_status || 'Pending');
    setAlterBilledAmount(enq.billed_amount || null);
    
    const items = (enq.enquiry_items || []).map(item => ({
      id: item.id,
      product_name: item.product_name || 'Commercial Plywood',
      thickness: item.thickness,
      size: item.size,
      quantity: item.quantity,
      rate: item.rate || 0
    }));
    setAlterItems(items);
    setAlterModalOpen(true);
  };

  const handleSaveAlterEnquiry = async () => {
    if (!alterEnquiryId) return;
    if (alterStatus === 'PAYMENT') {
      handleSaveAlterPayment();
      return;
    }
    try {
      const { error: eErr } = await supabase
        .from('enquiries')
        .update({
          dealer_name: alterDealerName,
          delivery_location: alterDeliveryLocation,
          comments: alterComments || null,
          status: alterStatus,
          payment_status: alterPaymentStatus,
          billed_amount: alterBilledAmount
        })
        .eq('id', alterEnquiryId);

      if (eErr) throw eErr;

      for (const item of alterItems) {
        const { error: iErr } = await supabase
          .from('enquiry_items')
          .update({
            quantity: item.quantity,
            rate: item.rate
          })
          .eq('id', item.id);
        if (iErr) throw iErr;
      }

      setAlterModalOpen(false);
      await fetchData();
      alert("Enquiry and items updated successfully!");
    } catch (err) {
      console.error('Failed to save altered entry:', err);
      alert('Error updating entry. Check console.');
    }
  };

  const handleToggleDealerBlock = async (dealerId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    const actionName = nextStatus === 'blocked' ? 'Block' : 'Unblock';
    if (!window.confirm(`Are you sure you want to ${actionName} this dealer profile?`)) return;

    try {
      const { error } = await supabase
        .from('dealers')
        .update({ status: nextStatus })
        .eq('id', dealerId);

      if (error) throw error;
      alert(`Dealer profile status updated to ${nextStatus}!`);
      await fetchData();
    } catch (err) {
      console.error(`Failed to ${actionName} dealer:`, err);
      alert(`Error trying to ${actionName} dealer.`);
    }
  };

  const handleDeleteDealer = async (dealerId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this dealer profile? This action is irreversible.")) return;

    try {
      const { error } = await supabase
        .from('dealers')
        .delete()
        .eq('id', dealerId);

      if (error) throw error;
      alert("Dealer profile permanently deleted from records.");
      await fetchData();
    } catch (err) {
      console.error("Failed to delete dealer:", err);
      alert("Error trying to delete dealer.");
    }
  };

  const getDealerLedgerTransactions = (dealerPhone: string) => {
    // 1. Get all completed / sent enquiries
    const bills = enquiries
      .filter((e) => e.dealer_phone === dealerPhone && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent'))
      .map((e) => ({
        id: e.id,
        date: new Date(e.created_at),
        type: 'Bill',
        ref: `Bill Ref: ENQ-${e.id.substring(0, 8).toUpperCase()}`,
        debit: e.billed_amount || 0,
        credit: 0,
        payment_status: e.payment_status || 'Pending',
        details: e
      }));

    // 2. Get all payment logs
    const savedLogs = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('hd_payment_logs') || '[]') : [];
    const receipts = savedLogs
      .filter((p: any) => p.dealer_phone === dealerPhone)
      .map((p: any) => ({
        id: p.id,
        date: new Date(p.created_at),
        type: 'Receipt',
        ref: `Receipt: ${p.id.toUpperCase()}${p.reference_bill_id !== 'advance' ? ` (Against ENQ-${p.reference_bill_id.substring(0,8).toUpperCase()})` : ' (Advance)'}`,
        debit: 0,
        credit: p.amount,
        payment_status: 'Paid',
        details: p
      }));

    // Combine and sort chronologically (ascending)
    const combined = [...bills, ...receipts].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running balances
    let runningBal = 0;
    return combined.map((tx) => {
      runningBal += tx.debit - tx.credit;
      return {
        ...tx,
        balance: runningBal
      };
    });
  };

  const printLedgerHTML = (dealer: Dealer) => {
    const transactions = getDealerLedgerTransactions(dealer.phone_number);
    const outstanding = getDealerOutstandingBalance(dealer.phone_number);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let rowsHtml = '';
    transactions.forEach((tx) => {
      rowsHtml += `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.date.toLocaleDateString('en-IN')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.ref}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${tx.debit > 0 ? '#b45309' : '#333'};">
            ${tx.debit > 0 ? `₹${tx.debit.toLocaleString('en-IN')}` : '-'}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${tx.credit > 0 ? '#15803d' : '#333'};">
            ${tx.credit > 0 ? `₹${tx.credit.toLocaleString('en-IN')}` : '-'}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">
            ₹${tx.balance.toLocaleString('en-IN')}
          </td>
        </tr>
      `;
    });

    let html = `
      <html>
      <head>
        <title>Ledger - ${dealer.full_name}</title>
        <style>
          body { font-family: monospace; padding: 20px; color: #1c1917; background-color: #fdfbf7; }
          h2 { margin-bottom: 5px; color: #78350f; border-bottom: 4px solid #78350f; padding-bottom: 8px; }
          .header-info { margin-bottom: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; border-bottom: 2px solid #78350f; padding-bottom: 15px; }
          .bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #78350f; color: #fff; padding: 8px; text-align: left; }
          @media print {
            body { padding: 0; background: #fff; }
          }
        </style>
      </head>
      <body>
        <h2>HD PLYWOOD - CUSTOMER LEDGER STATEMENT</h2>
        <div class="header-info">
          <div>
            <div><strong>Customer/Dealer:</strong> ${dealer.full_name}</div>
            <div><strong>Phone Number:</strong> ${dealer.phone_number}</div>
            <div><strong>Email Address:</strong> ${dealer.email}</div>
          </div>
          <div style="text-align: right;">
            <div><strong>GSTIN Number:</strong> ${dealer.gstin || 'N/A'}</div>
            <div><strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
            <div><strong>Final Outstanding:</strong> <span class="bold" style="font-size: 14px; color: #78350f;">₹${outstanding.toLocaleString('en-IN')}/-</span></div>
          </div>
        </div>
        <h3>CHRONOLOGICAL LEDGER DETAILS:</h3>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Date</th>
              <th style="text-align: left;">Particulars</th>
              <th style="text-align: right;">Debit (Purchase)</th>
              <th style="text-align: right;">Credit (Receipt)</th>
              <th style="text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div style="font-size: 9px; color: #78716c; text-align: center; margin-top: 40px; border-top: 1px solid #d6d3d1; padding-top: 10px;">
          Thank you for choosing HD PLYWOOD
        </div>
      </body>
      <script>
        window.onload = function() {
          window.print();
          window.close();
        }
      </script>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getWhatsAppLedgerLink = (dealer: Dealer) => {
    const outstanding = getDealerOutstandingBalance(dealer.phone_number);
    const cleanPhone = dealer.phone_number.replace(/[^0-9]/g, '');
    const message = `Hi ${dealer.full_name}, your pending balance at HD PLYWOOD is ₹${outstanding}/-. Please clear the dues soon.`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const getWhatsAppOutstandingLink = (dealer: Dealer) => {
    const outstanding = getDealerOutstandingBalance(dealer.phone_number);
    const cleanPhone = dealer.phone_number.replace(/[^0-9]/g, '');
    const text = `Hi ${dealer.full_name}, your outstanding balance is ₹${outstanding}/-.`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const getWhatsAppLedgerSummaryLink = (dealer: Dealer) => {
    const outstanding = getDealerOutstandingBalance(dealer.phone_number);
    const cleanPhone = dealer.phone_number.replace(/[^0-9]/g, '');
    const dealerEnqs = enquiries.filter(
      (e) => e.dealer_phone === dealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent')
    ).slice(0, 5);
    
    let text = `Hi ${dealer.full_name}, your outstanding balance is ₹${outstanding}/-. \n\n*Recent Purchases:*`;
    dealerEnqs.forEach(e => {
      text += `\n- Date: ${new Date(e.created_at).toLocaleDateString('en-IN')} | Total: ₹${e.billed_amount || 0}/- (${e.payment_status || 'Pending'})`;
    });
    
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const getWhatsAppInvoiceLinkForEnq = (enq: Enquiry) => {
    const cleanPhone = enq.dealer_phone.replace(/[^0-9]/g, '');
    let text = `*HD PLYWOOD - TAX INVOICE RECEIPT*\n`;
    text += `-------------------------------\n`;
    text += `*Ref Order ID:* ${enq.id.substring(0, 8).toUpperCase()}\n`;
    text += `*Date:* ${new Date(enq.created_at).toLocaleDateString('en-IN')}\n`;
    text += `*Customer/Dealer:* ${enq.dealer_name}\n`;
    text += `*Delivery:* ${enq.delivery_location}\n`;
    text += `*Billed Amount:* ₹${(enq.billed_amount || 0).toLocaleString('en-IN')}/-\n`;
    text += `*Payment Status:* ${enq.payment_status || 'Pending'}\n\n`;
    text += `*Items Details:*`;
    (enq.enquiry_items || []).forEach(item => {
      text += `\n- ${item.product_name} (${item.thickness}, ${item.size}${item.quality ? `, ${item.quality}` : ''}) x ${item.quantity} Sheets`;
    });
    text += `\n\nThank you for doing business with us!`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleRateChange = (itemId: string, rate: number) => {
    setItemRates((prev) => ({
      ...prev,
      [itemId]: Math.max(0, rate),
    }));
  };

  // --- LAMINATE BILLING ENGINE LOGIC FIXED ---
  const calculateItemAmount = (item: EnquiryItem): number => {
    const rate = itemRates[item.id] || 0;
    const qty = item.quantity;

    // Check if the item category or name is Laminate
    const isLaminate = item.product_name?.toLowerCase().includes('laminate');

    if (isLaminate) {
      // Laminate Formula: Total Quantity × Rate = Total Amount (Bypass area calculations)
      return qty * rate;
    }

    // Plywood Formula remains exactly standard:
    const { length, width } = parseDimensions(item.size);
    if (billingMode === 'Feet') {
      return length * width * qty * rate;
    } else {
      const convL = convertLengthToMetre(length);
      const convW = convertWidthToMetre(width);
      const convRate = rate * 10.764;
      return convL * convW * qty * convRate;
    }
  };

  const getItemsSubtotal = (): number => {
    if (!activeBillingEnquiry) return 0;
    return (activeBillingEnquiry.enquiry_items || []).reduce(
      (sum, item) => sum + calculateItemAmount(item),
      0
    );
  };

  const handleOpenDraftPreview = () => {
    const subtotal = getItemsSubtotal();
    const transport = addTransport ? transportFee : 0;
    const itemsWithTransport = subtotal + transport;
    const gst = addGst ? itemsWithTransport * 0.18 : 0;
    setFinalGrandTotal(Math.round(itemsWithTransport + gst));
    setShowDraftPreview(true);
  };

  // Save finalized bill to database
  const handleSaveAndFinalizeBill = async () => {
    if (!activeBillingEnquiry) return;
    try {
      const { error } = await supabase
        .from('enquiries')
        .update({
          status: 'Completed',
          billed_amount: finalGrandTotal
        })
        .eq('id', activeBillingEnquiry.id);

      if (error) throw error;

      // Update individual item rates in the database
      for (const item of activeBillingEnquiry.enquiry_items || []) {
        const rate = itemRates[item.id] || 0;
        const { error: itemError } = await supabase
          .from('enquiry_items')
          .update({ rate })
          .eq('id', item.id);
        
        if (itemError) throw itemError;
      }
      
      // Update state locally
      await fetchData();
    } catch (err) {
      console.error('Failed to update finalized wholesale invoice in database:', err);
    }
    setIsBillFinalized(true);
  };

  // --- DIGITAL BILL IMAGE GENERATION & DOWNLOAD ---
  const handleGenerateInvoiceImage = async () => {
    if (!invoiceCaptureRef.current || !activeBillingEnquiry) return;
    setIsCapturingBill(true);
    try {
      // Clone element off-screen to avoid hidden overflow / viewport scale issues
      const originalElement = invoiceCaptureRef.current;
      const clone = originalElement.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.width = '450px';
      clone.style.height = 'auto';
      clone.style.backgroundColor = '#ffffff';
      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      document.body.removeChild(clone);

      // Convert to image download link or share
      const imageURL = canvas.toDataURL('image/png');
      
      // Try sharing first if navigator.share exists (excellent for mobile)
      if (navigator.share && navigator.canShare) {
        try {
          const blob = await (await fetch(imageURL)).blob();
          const file = new File([blob], `HD-PLY-Invoice-${activeBillingEnquiry.id.substring(0, 8).toUpperCase()}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'HD PLY Invoice',
              text: `Invoice for ${activeBillingEnquiry.dealer_name}`
            });
            return;
          }
        } catch (shareErr) {
          console.warn('Native share failed, falling back to download:', shareErr);
        }
      }

      const downloadLink = document.createElement('a');
      downloadLink.href = imageURL;
      downloadLink.download = `HD-PLY-Invoice-${activeBillingEnquiry.id.substring(0, 8).toUpperCase()}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error('Failed to generate high-resolution invoice image:', err);
    } finally {
      setIsCapturingBill(false);
    }
  };

  const generateInvoiceImageForBill = async (enq: Enquiry) => {
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = '450px';
    tempContainer.style.backgroundColor = '#ffffff';
    tempContainer.style.fontFamily = 'monospace';
    tempContainer.style.color = '#1c1917';
    tempContainer.style.padding = '24px';
    tempContainer.style.border = '4px solid #0c0a09';
    tempContainer.style.borderRadius = '16px';
    tempContainer.style.lineHeight = '1.625';
    tempContainer.style.fontSize = '11px';

    let itemsHtml = '';
    (enq.enquiry_items || []).forEach((item) => {
      const isLaminate = item.product_name?.toLowerCase().includes('laminate');
      const { length, width } = parseDimensions(item.size);
      const areaText = isLaminate ? '' : ` | ${length * width * item.quantity} sq ft`;
      itemsHtml += `
        <div style="border-bottom: 1px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px;">
          <div style="font-weight: bold;">${item.product_name}</div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #57534e;">
            <span>${item.thickness} | ${item.size} ft ${item.quality ? `| ${item.quality}` : ''}</span>
            <span>Qty: ${item.quantity} sheets</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #78716c; margin-top: 2px;">
            <span>Rate: ₹${item.rate || 0}/-${areaText}</span>
            <span>₹${(isLaminate ? (item.quantity * (item.rate || 0)) : (length * width * item.quantity * (item.rate || 0))).toLocaleString('en-IN')}/-</span>
          </div>
        </div>
      `;
    });

    tempContainer.innerHTML = `
      <div style="text-align: center; font-weight: 900; font-size: 18px; letter-spacing: 0.1em; border-bottom: 4px solid #0c0a09; padding-bottom: 8px; text-transform: uppercase;">
        HD PLYWOOD
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px; font-weight: bold; border-bottom: 2px solid #0c0a09; padding-bottom: 8px; margin-top: 8px; text-transform: uppercase; clear: both;">
        <div style="float: left; width: 50%;">
          <div>Dealer Name: ${enq.dealer_name}</div>
          <div>Phone Number: ${enq.dealer_phone}</div>
        </div>
        <div style="float: right; width: 50%; text-align: right;">
          <div>Ref Order ID: ${enq.id.substring(0, 8).toUpperCase()}</div>
          <div>Invoice Date: ${new Date(enq.created_at).toLocaleDateString('en-IN')}</div>
          <div>Payment Status: <span style="text-decoration: underline;">${enq.payment_status || 'Pending'}</span></div>
        </div>
        <div style="clear: both;"></div>
      </div>
      <div style="margin-top: 12px; margin-bottom: 12px;">
        <div style="font-weight: 900; font-size: 10px; color: #78716c; text-transform: uppercase; margin-bottom: 8px;">Billed Items Summary</div>
        ${itemsHtml}
      </div>
      <div style="border-top: 2px solid #0c0a09; padding-top: 8px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; color: #0c0a09;">
          <span>GRAND TOTAL RECEIPT:</span>
          <span>₹${(enq.billed_amount || 0).toLocaleString('en-IN')}/-</span>
        </div>
      </div>
      <div style="font-size: 9px; color: #a8a29e; text-align: center; margin-top: 16px; border-top: 1px solid #e7e5e4; padding-top: 8px;">
        Thank you for choosing HD PLYWOOD
      </div>
    `;

    document.body.appendChild(tempContainer);

    try {
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imageURL = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = imageURL;
      downloadLink.download = `HD-PLYWOOD-Receipt-${enq.id.substring(0, 8).toUpperCase()}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error('Failed to generate receipt image off-screen:', err);
    } finally {
      document.body.removeChild(tempContainer);
    }
  };

  const handleSendSelectedBills = async () => {
    if (selectedBillIds.length === 0 || !selectedLedgerDealer) return;
    for (const billId of selectedBillIds) {
      const enq = enquiries.find(e => e.id === billId);
      if (enq) {
        await generateInvoiceImageForBill(enq);
      }
    }
    const cleanPhone = selectedLedgerDealer.phone_number.replace(/[^0-9]/g, '');
    let text = `Hi ${selectedLedgerDealer.full_name}, sending you the receipt image(s) for the following bill(s):`;
    selectedBillIds.forEach(billId => {
      const enq = enquiries.find(e => e.id === billId);
      if (enq) {
        text += `\n- Ref: ${enq.id.substring(0,8).toUpperCase()} | Date: ${new Date(enq.created_at).toLocaleDateString('en-IN')} | Total: ₹${enq.billed_amount || 0}/-`;
      }
    });
    text += `\n\nPlease find the attached receipt images in this chat.`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const getWhatsAppInvoiceLink = () => {
    if (!activeBillingEnquiry) return '#';
    const cleanPhone = activeBillingEnquiry.dealer_phone.replace(/[^0-9]/g, '');
    const text = `HD PLY - Invoice generated successfully for your recent order. Total Amount: ${finalGrandTotal}/-`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleLogoutAdmin = () => {
    sessionStorage.removeItem('hd_admin_auth');
    setIsAuthenticated(false);
  };

  // Filter out locked enquiries (only those older than 30 seconds grace period)
  const lockedEnquiries = enquiries.filter((enq) => {
    const elapsedSec = Math.floor((Date.now() - new Date(enq.created_at).getTime()) / 1000);
    return elapsedSec >= 30;
  });

  if (!isAuthenticated) {
    /* Passcode Gate screen (Locked to Vply@1) */
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center font-sans wood-pattern px-4">
        <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-800 text-white shadow-md font-black text-xl">
            HD
          </div>
          <div>
            <h2 className="text-lg font-black text-stone-900">Admin Console Gate</h2>
            <p className="text-[10px] text-stone-500 mt-1 uppercase tracking-wider font-semibold">HD PLY Wholesale</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4 text-left">
            <div>
              <label htmlFor="passcode" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                Enter Admin Password
              </label>
              <input
                type="password"
                id="passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Password"
                className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-xs text-center font-bold text-stone-900 focus:outline-none"
              />
              {passcodeError && (
                <span className="text-[10px] text-red-600 font-bold mt-1.5 block text-center">
                  {passcodeError}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3 text-xs font-bold shadow-md transition"
            >
              Verify Password
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/50 wood-pattern flex flex-col font-sans">
      <Navbar />

      {/* Real-time Visual Notification Alert Banner overlay */}
      {newEnquiryAlert.visible && (
        <div className="bg-emerald-600 text-white py-3 px-4 shadow-lg text-xs font-bold animate-slide-in flex items-center justify-between z-40 relative">
          <div className="flex items-center space-x-2.5">
            <svg className="h-4.5 w-4.5 animate-bounce text-emerald-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>
              New live wholesale enquiry from <strong className="text-white underline">{newEnquiryAlert.dealerName}</strong>! Ref ID: <strong className="uppercase">{newEnquiryAlert.id?.substring(0, 8)}</strong>
            </span>
          </div>
          <button
            onClick={() => setNewEnquiryAlert({ visible: false })}
            className="bg-emerald-800 hover:bg-emerald-950 px-2.5 py-1 rounded text-[10px] font-bold text-white transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Admin Stats Header Banner */}
      <section className="relative overflow-hidden wood-gradient text-white py-10 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/40 via-amber-950/70 to-stone-950/90" />
        <div className="relative mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="inline-flex items-center rounded-full bg-amber-800/40 border border-amber-600/30 px-3 py-1 text-[9px] font-extrabold uppercase tracking-widest text-amber-300">
              Admin Console
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight">
              HD PLY Dashboard
            </h2>
            <p className="text-xs text-stone-300 mt-1 max-w-xs leading-relaxed">
              Manage wholesale registered dealers, log sessions, and review real-time sheet enquiries.
            </p>
            <button
              onClick={requestNotificationPermission}
              className={`mt-3.5 font-extrabold uppercase text-[10px] tracking-wider py-2.5 px-3.5 rounded-xl transition flex items-center space-x-1.5 shadow-sm border cursor-pointer active:scale-95 transition-all duration-300 ${
                isAudioEnabled
                  ? 'bg-slate-700 hover:bg-slate-800 border-slate-600 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-white animate-pulse'
              }`}
            >
              {isAudioEnabled ? (
                <>
                  <span>🔔 Alerts Active</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span>Enable Real-time Alert Chimes</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleLogoutAdmin}
            className="md:hidden text-[10px] border border-amber-700 bg-amber-950/20 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-900"
          >
            Logout Admin
          </button>

          {/* Quick Metrics */}
          <div className="flex gap-4 flex-wrap justify-center">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 w-28 text-center shadow-xs">
              <span className="block text-[10px] text-stone-300 font-bold uppercase">Dealers</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{totalDealers}</span>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 w-28 text-center shadow-xs">
              <span className="block text-[10px] text-stone-300 font-bold uppercase">Active Devices</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{activeSessions}</span>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 w-28 text-center shadow-xs">
              <span className="block text-[10px] text-stone-300 font-bold uppercase">Pending</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{pendingEnquiries}</span>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10 w-32 text-center shadow-xs">
              <span className="block text-[10px] text-stone-300 font-bold uppercase">Total Sheets</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{totalSheetsRequested}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Power Tabs */}
      <div className="bg-white border-b border-stone-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-wrap">
          <button
            onClick={() => setActiveAdminTab('enquiries')}
            className={`py-4 px-6 text-xs font-bold border-b-2 transition ${
              activeAdminTab === 'enquiries'
                ? 'border-amber-800 text-stone-900 font-black'
                : 'border-transparent text-stone-500 hover:text-stone-950'
            }`}
          >
            Enquiry Command Center ({lockedEnquiries.length})
          </button>
          <button
            onClick={() => setActiveAdminTab('ledger')}
            className={`py-4 px-6 text-xs font-bold border-b-2 transition ${
              activeAdminTab === 'ledger'
                ? 'border-amber-800 text-stone-900 font-black'
                : 'border-transparent text-stone-500 hover:text-stone-950'
            }`}
          >
            Simple Party Ledger & History
          </button>
          <button
            onClick={() => setActiveAdminTab('dealers')}
            className={`py-4 px-6 text-xs font-bold border-b-2 transition ${
              activeAdminTab === 'dealers'
                ? 'border-amber-800 text-stone-900 font-black'
                : 'border-transparent text-stone-500 hover:text-stone-950'
            }`}
          >
            Registered Dealers Hub ({dealers.length})
          </button>
        </div>
      </div>

      {/* Main Splits layout */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        
        {activeAdminTab === 'enquiries' && (() => {
          const filteredLockedEnquiries = enquiries.filter((enq) => {
            const elapsedSec = Math.floor((Date.now() - new Date(enq.created_at).getTime()) / 1000);
            if (elapsedSec < 30) return false;
            
            const statusLower = enq.status.toLowerCase();
            if (workflowFilter === 'Pending') {
              return statusLower === 'pending' || statusLower === 'contacted';
            }
            if (workflowFilter === 'LeftToSend') {
              return statusLower === 'completed';
            }
            if (workflowFilter === 'Sent') {
              return statusLower === 'sent';
            }
            if (workflowFilter === 'Cancelled') {
              return statusLower === 'cancelled';
            }
            return true;
          });

          return (
            <div className="space-y-4">
              
              {/* Grouping Filter Bar Ribbon */}
              <div className="rounded-3xl border border-stone-200 bg-white p-3 shadow-xs flex flex-wrap gap-2 animate-pop">
                {[
                  { key: 'All', label: 'All Orders' },
                  { key: 'Pending', label: 'Bill Generation Pending' },
                  { key: 'LeftToSend', label: 'Created - Left to Send' },
                  { key: 'Sent', label: 'Already Sent' },
                  { key: 'Cancelled', label: 'Cancelled' }
                ].map((tab) => {
                  const isActive = workflowFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setWorkflowFilter(tab.key as any)}
                      className={`px-3.5 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition ${
                        isActive
                          ? 'bg-amber-800 text-white shadow-sm'
                          : 'bg-stone-50 border border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <h3 className="text-xs font-extrabold text-stone-500 uppercase tracking-wider flex justify-between items-center">
                <span>Incoming Orders</span>
                <span className="text-[10px] text-stone-400 font-medium">{filteredLockedEnquiries.length} live records</span>
              </h3>

              <div className="space-y-4">
                {filteredLockedEnquiries.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400 font-medium shadow-xs">
                    No active enquiries found.
                  </div>
                ) : (
                  filteredLockedEnquiries.map((enq) => {
                    const sheetsCount = (enq.enquiry_items || []).reduce((sum, item) => sum + item.quantity, 0);
                    const sqFtCount = (enq.enquiry_items || []).reduce((sum, item) => {
                      if (item.product_name?.toLowerCase().includes('laminate')) return sum;
                      return sum + calculateSqFt(item.size, item.quantity);
                    }, 0);
                    const statusLower = enq.status.toLowerCase();

                    return (
                      <div key={enq.id} className="glass-card bg-white border border-stone-200 rounded-3xl p-5 space-y-4 shadow-xs relative overflow-hidden">
                        {/* Cancelled watermark overlay stamp */}
                        {statusLower === 'cancelled' && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-10 bg-white/40">
                            <div className="text-red-655 border-8 border-red-655 font-extrabold text-3xl px-6 py-2.5 rounded-2xl uppercase tracking-widest -rotate-12 opacity-80 shadow-md">
                              ORDER CANCELLED
                            </div>
                          </div>
                        )}

                        {/* Enquiry Header */}
                        <div className="flex justify-between items-start flex-wrap gap-2.5 pb-3 border-b border-stone-150">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <h4 className="text-sm font-black text-stone-900 leading-none">{enq.dealer_name}</h4>
                              <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200/50 rounded px-1.5 py-0.5 tracking-wider uppercase">
                                Ref: {enq.id.substring(0, 8)}
                              </span>
                              <button
                                onClick={() => openAlterEnquiryModal(enq)}
                                className="p-1 hover:bg-stone-100 rounded text-stone-600 transition"
                                title="Alter enquiry / order items"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
                            
                            <div className="text-[10px] text-stone-500 font-medium">
                              Company: <strong className="text-stone-800">{enq.company_name || 'Individual Profile'}</strong>
                            </div>
                            
                            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 mt-1">
                              <span>Phone: <strong className="text-stone-750">{enq.dealer_phone}</strong></span>
                              <span>•</span>
                              <span>{new Date(enq.created_at).toLocaleString('en-IN')}</span>
                              <span>•</span>
                              <span className="inline-flex items-center text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                                Origin: Customer Portal (hd-enquiry)
                              </span>
                            </div>
                          </div>

                          {/* Status indicators */}
                          <span className={`text-[10px] font-black rounded-lg px-2.5 py-1 border uppercase tracking-wider ${
                            statusLower === 'pending'
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : statusLower === 'contacted'
                              ? 'border-blue-200 bg-blue-50 text-blue-900'
                              : (statusLower === 'completed' || statusLower === 'sent')
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : statusLower === 'cancelled'
                              ? 'border-red-200 bg-red-50 text-red-905'
                              : 'border-stone-200 bg-stone-50 text-stone-600'
                          }`}>
                            {enq.status}
                          </span>
                        </div>

                        {/* Items requested */}
                        <div className="space-y-2">
                          <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Items Requested</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(enq.enquiry_items || []).map((item) => {
                              const isLaminate = item.product_name?.toLowerCase().includes('laminate');
                              return (
                                <div key={item.id} className="rounded-xl border border-stone-100 bg-stone-50/50 p-2.5 flex items-center justify-between text-xs font-semibold">
                                  <div>
                                    <span className="font-bold text-stone-850 block">{item.product_name}</span>
                                    <span className="text-[10px] text-stone-500 mt-0.5 block">
                                      thickness: <strong>{item.thickness}</strong> | size: <strong>{item.size} ft</strong>{item.quality ? ` | quality: <strong>${item.quality}</strong>` : ''}
                                    </span>
                                    {!isLaminate && (
                                      <span className="text-[9px] text-stone-400 block mt-0.5 animate-pop">
                                        Area: {calculateSqFt(item.size, item.quantity)} sq ft
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-amber-800 font-bold shrink-0">{item.quantity} sheets</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Summary details */}
                        <div className="bg-amber-50/40 rounded-xl p-3 border border-amber-100/55 flex justify-between items-center text-xs font-bold text-stone-800">
                          <span>Total Summary Estimation:</span>
                          <div className="text-right text-stone-900 font-black">
                            <span className="text-amber-800 block">{sheetsCount} Sheets</span>
                            {sqFtCount > 0 && <span className="text-stone-500 text-[10px] block">{sqFtCount} Sq Ft Area</span>}
                            {enq.billed_amount && <span className="text-emerald-700 block text-xs mt-0.5">Grand Total: ₹{enq.billed_amount.toLocaleString()}/-</span>}
                          </div>
                        </div>

                        {/* Delivery details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-stone-100 text-xs">
                          <div>
                            <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Delivery Location</span>
                            <span className="text-stone-800 font-bold mt-1 block">{enq.delivery_location}</span>
                          </div>
                          {enq.comments && (
                            <div>
                              <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Comments/Notes</span>
                              <span className="text-stone-750 font-medium leading-relaxed mt-1 block italic">"{enq.comments}"</span>
                            </div>
                          )}
                        </div>

                        {/* Toggleable Follow-up Quick Action Drawer */}
                        {activeFollowUpId === enq.id && (
                          <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2 animate-pop">
                            <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">Follow Up Communications</span>
                            <div className="flex flex-col gap-2">
                              <a
                                href={`tel:${enq.dealer_phone}`}
                                className="text-center bg-white border border-stone-250 hover:border-amber-850 px-3 py-2.5 rounded-lg font-bold text-xs text-stone-750 flex items-center justify-center space-x-1.5"
                              >
                                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>Call: {enq.dealer_phone}</span>
                              </a>
                            </div>
                            <div className="flex space-x-2 pt-1">
                              <a
                                href={`sms:${enq.dealer_phone}?body=${encodeURIComponent(`Hi ${enq.dealer_name}, this is HD PLYWOOD regarding your recent wholesale enquiry. Please connect back.`)}`}
                                className="flex-1 text-center bg-amber-800 hover:bg-amber-900 text-white py-1.5 rounded-lg font-bold text-[10px] block"
                              >
                                Send SMS
                              </a>
                              <a
                                href={`https://wa.me/${enq.dealer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${enq.dealer_name}, this is HD PLYWOOD regarding your recent wholesale enquiry.`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg font-bold text-[10px] block"
                              >
                                Open WhatsApp
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Action buttons (Delete, Cancel, Follow Up) */}
                        <div className="pt-3 border-t border-stone-100 flex flex-wrap gap-3">
                          {statusLower !== 'cancelled' && statusLower !== 'completed' && statusLower !== 'sent' && (
                            <>
                              <button
                                onClick={() => setActiveFollowUpId(activeFollowUpId === enq.id ? null : enq.id)}
                                className="flex-1 bg-blue-600 hover:bg-blue-750 text-white rounded-xl py-2 px-4 text-xs font-bold shadow-xs transition"
                              >
                                {activeFollowUpId === enq.id ? 'Close Follow-Up' : 'Follow Up'}
                              </button>
                              
                              <button
                                onClick={async () => {
                                  if (window.confirm("Are you sure you want to cancel the order?")) {
                                    await handleUpdateStatus(enq.id, 'Cancelled');
                                  }
                                }}
                                className="flex-1 border border-stone-250 bg-white hover:bg-stone-50 text-stone-650 rounded-xl py-2 px-4 text-xs font-bold transition"
                              >
                                Cancel Order
                              </button>

                              <button
                                onClick={() => handleOpenBilling(enq)}
                                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-2 px-4 text-xs font-bold shadow-xs transition"
                              >
                                Generate Bill
                              </button>
                            </>
                          )}

                          {statusLower === 'cancelled' && (
                            <button
                              onClick={() => handleReorderAdmin(enq)}
                              className="flex-1 bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-2 px-4 text-xs font-bold shadow-xs transition"
                            >
                              Order Again
                            </button>
                          )}

                          {(statusLower === 'sent' || statusLower === 'completed') && (
                            <a
                              href={`https://wa.me/${enq.dealer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`HD PLYWOOD - Outstanding bill reminder for your reference ID: ${enq.id.substring(0,8).toUpperCase()}. Amount: ₹${enq.billed_amount || 0}/-.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-4 text-xs font-bold shadow-xs transition text-center"
                            >
                              Send Again
                            </a>
                          )}

                          <button
                            onClick={() => handleDeleteEnquiry(enq.id)}
                            className="border border-red-200 hover:bg-red-50 text-red-650 rounded-xl py-2 px-3 text-xs font-bold transition"
                            title="Delete permanently"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}

        {/* VIEW 2: Registered Dealers Hub */}
        {activeAdminTab === 'dealers' && (
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-stone-500 uppercase tracking-wider flex justify-between items-center">
              <span>Registered Business Profiles</span>
              <span className="text-[10px] text-stone-400 font-medium">{dealers.length} profiles</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {dealers.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400 font-medium">
                  No registered dealers yet.
                </div>
              ) : (
                dealers.map((dealer) => (
                  <div
                    key={dealer.id}
                    className={`glass-card bg-white border rounded-3xl p-5 space-y-3.5 shadow-xs relative overflow-hidden transition-all duration-300 ${
                      dealer.status === 'blocked' ? 'border-red-300 bg-red-50/10 opacity-75' : 'border-stone-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-stone-900 leading-snug">{dealer.full_name}</h4>
                        {dealer.status === 'blocked' ? (
                          <span className="inline-flex items-center space-x-1 mt-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-red-655 uppercase tracking-wider">Blocked</span>
                          </span>
                        ) : dealer.device_registered ? (
                          <span className="inline-flex items-center space-x-1 mt-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Online</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 mt-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Offline</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-stone-400 font-bold">
                        {new Date(dealer.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5 text-stone-600 border-t border-stone-100 pt-3">
                      <div className="flex justify-between">
                        <span className="text-stone-400">Phone:</span>
                        <span className="font-bold text-stone-900">{dealer.phone_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400">Email:</span>
                        <span className="font-bold text-stone-800 truncate max-w-44">{dealer.email}</span>
                      </div>
                      {dealer.gstin && (
                        <div className="flex justify-between">
                          <span className="text-stone-400">GSTIN:</span>
                          <span className="font-bold text-stone-900 uppercase">{dealer.gstin}</span>
                        </div>
                      )}
                      {dealer.shop_address && (
                        <div className="pt-2 border-t border-stone-100 flex flex-col space-y-1">
                          <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">Shop Address</span>
                          <span className="text-[11px] text-stone-750 leading-relaxed italic">"{dealer.shop_address}"</span>
                        </div>
                      )}
                      
                      <div className="pt-3 border-t border-stone-100 flex gap-2">
                        <button
                          onClick={() => handleToggleDealerBlock(dealer.id, dealer.status)}
                          className={`flex-1 rounded-xl py-1.5 px-3 text-[10px] font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                            dealer.status === 'blocked'
                              ? 'bg-red-100 border border-red-200 text-red-700 hover:bg-red-200 shadow-none'
                              : 'bg-stone-100 border border-stone-200 text-stone-700 hover:bg-stone-200 shadow-none'
                          }`}
                        >
                          {dealer.status === 'blocked' ? '🔴 Unblock' : '🚫 Block'}
                        </button>
                        <button
                          onClick={() => handleDeleteDealer(dealer.id)}
                          className="rounded-xl border border-red-200 hover:bg-red-50 text-red-655 py-1.5 px-3 text-[10px] font-black uppercase tracking-wider transition cursor-pointer active:scale-95"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: Simple Party Ledger & History */}
        {activeAdminTab === 'ledger' && (
          <div className="space-y-6">
            {/* Sub navigation for Ledger Workspace */}
            <div className="flex border-b border-stone-200">
              <button
                onClick={() => setLedgerSubTab('parties')}
                className={`py-2 px-4 text-xs font-bold border-b-2 transition ${
                  ledgerSubTab === 'parties'
                    ? 'border-amber-800 text-stone-900 font-black'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                Party Ledgers
              </button>
              <button
                onClick={() => setLedgerSubTab('bill_history')}
                className={`py-2 px-4 text-xs font-bold border-b-2 transition ${
                  ledgerSubTab === 'bill_history'
                    ? 'border-amber-800 text-stone-900 font-black'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                Bill History Ledger
              </button>
            </div>

            {/* Sub-View 1: Party Ledgers */}
            {ledgerSubTab === 'parties' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Panel: Search & Select Party */}
                <div className="lg:col-span-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-xs font-extrabold text-stone-500 uppercase tracking-wider mb-2">Search Customer Account</h3>
                    <input
                      type="text"
                      placeholder="Search company/customer name..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-xs font-bold text-stone-900 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {dealers
                      .filter((d) => d.full_name.toLowerCase().includes(ledgerSearch.toLowerCase()))
                      .map((dealer) => {
                        const bal = getDealerOutstandingBalance(dealer.phone_number);
                        const isSelected = selectedLedgerDealer?.id === dealer.id;
                        return (
                          <button
                            key={dealer.id}
                            onClick={() => {
                              setSelectedLedgerDealer(dealer);
                              setSelectedBillIds([]);
                            }}
                            className={`w-full text-left rounded-2xl border p-3.5 flex justify-between items-center transition ${
                              isSelected
                                ? 'border-amber-800 bg-amber-50/30'
                                : 'border-stone-150 hover:bg-stone-50/50'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="text-xs font-black text-stone-900 block truncate">{dealer.full_name}</span>
                              <span className="text-[10px] text-stone-500 block mt-0.5">{dealer.phone_number}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Outstanding</span>
                              <span className={`text-xs font-black block mt-0.5 ${bal > 0 ? 'text-red-650' : 'text-stone-500'}`}>
                                ₹{bal.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Right Panel: Party Ledger Statement */}
                <div className="lg:col-span-8">
                  {!selectedLedgerDealer ? (
                    <div className="text-center py-24 bg-white border border-stone-200 rounded-3xl text-xs text-stone-400 font-medium">
                      Select a company from the left panel to review statement sheets.
                    </div>
                  ) : (
                    <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-6">
                      
                      {/* Statement Header */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-stone-150">
                        <div>
                          <span className="text-[9px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200/50 rounded-full px-2 py-0.5 tracking-wider uppercase">
                            Party Ledger Sheet
                          </span>
                          <h2 className="text-lg font-black text-stone-900 mt-2">{selectedLedgerDealer.full_name}</h2>
                          <div className="flex items-center space-x-3 text-xs text-stone-500 mt-1">
                            <span>Phone: <strong>{selectedLedgerDealer.phone_number}</strong></span>
                            {selectedLedgerDealer.gstin && (
                              <>
                                <span>•</span>
                                <span>GSTIN: <strong className="uppercase">{selectedLedgerDealer.gstin}</strong></span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Total Outstanding Balance</span>
                          <span className={`text-xl font-black block mt-1 ${getDealerOutstandingBalance(selectedLedgerDealer.phone_number) > 0 ? 'text-red-655' : 'text-stone-500'}`}>
                            ₹{getDealerOutstandingBalance(selectedLedgerDealer.phone_number).toLocaleString('en-IN')}/-
                          </span>
                        </div>
                      </div>
                      
                      {/* PDF and WhatsApp Shortcuts */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          onClick={() => printLedgerHTML(selectedLedgerDealer)}
                          className="flex-1 bg-stone-900 hover:bg-stone-955 text-white rounded-xl py-3 px-4 text-xs font-bold shadow-xs transition flex items-center justify-center space-x-2 min-h-[44px]"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>Print Statement / PDF</span>
                        </button>
                        
                        <a
                          href={getWhatsAppOutstandingLink(selectedLedgerDealer)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 px-4 text-xs font-bold shadow-xs transition flex items-center justify-center space-x-2 text-center min-h-[44px]"
                        >
                          <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
                            <path d="M12.008.01A11.996 11.996 0 00.007 12c0 2.215.58 4.37 1.688 6.275L.057 24l6.326-1.66c1.79.977 3.8 1.493 5.86 1.496a12.003 12.003 0 0012.007-12c0-3.208-1.248-6.223-3.513-8.49A11.947 11.947 0 0012.008.01zm0 22c-1.847-.003-3.66-.496-5.242-1.424l-.376-.223-3.89.98 1.03-3.766-.245-.389A9.971 9.971 0 011.995 12c0-5.522 4.492-10 10.013-10 2.668 0 5.176 1.04 7.062 2.926A9.96 9.96 0 0122.02 12c0 5.522-4.492 10-10.012 10z" />
                          </svg>
                          <span>Send Outstanding</span>
                        </a>

                        <a
                          href={getWhatsAppLedgerSummaryLink(selectedLedgerDealer)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-3 px-4 text-xs font-bold shadow-xs transition flex items-center justify-center space-x-2 text-center min-h-[44px]"
                        >
                          <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24">
                            <path d="M12.008.01A11.996 11.996 0 00.007 12c0 2.215.58 4.37 1.688 6.275L.057 24l6.326-1.66c1.79.977 3.8 1.493 5.86 1.496a12.003 12.003 0 0012.007-12c0-3.208-1.248-6.223-3.513-8.49A11.947 11.947 0 0012.008.01zm0 22c-1.847-.003-3.66-.496-5.242-1.424l-.376-.223-3.89.98 1.03-3.766-.245-.389A9.971 9.971 0 011.995 12c0-5.522 4.492-10 10.013-10 2.668 0 5.176 1.04 7.062 2.926A9.96 9.96 0 0122.02 12c0 5.522-4.492 10-10.012 10z" />
                          </svg>
                          <span>Send Ledger</span>
                        </a>
                      </div>

                      {/* Manual Payment Logging Form */}
                      <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4.5 space-y-4 animate-pop">
                        <h4 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-widest block">Log Manual Payment Entry</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          
                          <div className="space-y-1">
                            <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">Against Reference Bill</label>
                            <select
                              value={refBillId}
                              disabled={isAdvance}
                              onChange={(e) => setRefBillId(e.target.value)}
                              className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-xs font-bold text-stone-900 focus:outline-none disabled:opacity-50 min-h-[44px]"
                            >
                              <option value="advance">No Bill Selected</option>
                              {enquiries
                                .filter((e) => e.dealer_phone === selectedLedgerDealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid')
                                .map((e) => (
                                  <option key={e.id} value={e.id}>
                                    Ref: {e.id.substring(0,8).toUpperCase()} - ₹{(e.billed_amount || 0).toLocaleString()}/- ({new Date(e.created_at).toLocaleDateString('en-IN')})
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="flex items-center space-x-3 pb-3 md:pb-4 min-h-[44px]">
                            <input
                              type="checkbox"
                              id="is_advance_checkbox"
                              checked={isAdvance}
                              onChange={(e) => {
                                setIsAdvance(e.target.checked);
                                if (e.target.checked) {
                                  setRefBillId('advance');
                                } else {
                                  const unpaid = enquiries.find((e) => e.dealer_phone === selectedLedgerDealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid');
                                  setRefBillId(unpaid ? unpaid.id : 'advance');
                                }
                              }}
                              className="rounded border-stone-300 text-amber-800 focus:ring-amber-800 h-5 w-5"
                            />
                            <label htmlFor="is_advance_checkbox" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider cursor-pointer select-none">
                              Advance Payment
                            </label>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">Manual Entry Amount (₹)</label>
                            <input
                              type="number"
                              placeholder="Enter payment amount"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-xs font-bold text-stone-900 focus:outline-none min-h-[44px]"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            onClick={handleLogPayment}
                            className="w-full sm:w-auto bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3 px-6 text-xs font-bold shadow-xs transition min-h-[44px]"
                          >
                            Submit Payment Entry
                          </button>
                        </div>
                      </div>

                      {/* Chronological Tally-style Ledger Table */}
                      <div className="space-y-4">
                        <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest block">Tally-Style Detailed Ledger</span>
                        <div className="overflow-x-auto border border-stone-200 rounded-2xl bg-white shadow-xs">
                          <table className="min-w-[600px] w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                                <th className="py-3 px-4 w-28">Date</th>
                                <th className="py-3 px-3">Particulars</th>
                                <th className="py-3 px-3 text-right w-32">Debit (Dr)</th>
                                <th className="py-3 px-3 text-right w-32">Credit (Cr)</th>
                                <th className="py-3 px-4 text-right w-36">Running Balance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 text-xs font-semibold text-stone-800">
                              {getDealerLedgerTransactions(selectedLedgerDealer.phone_number).length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-8 text-center text-stone-400 font-medium">No transactions found for this party.</td>
                                </tr>
                              ) : (
                                getDealerLedgerTransactions(selectedLedgerDealer.phone_number).map((tx) => (
                                  <tr key={tx.id} className="hover:bg-stone-50/40">
                                    <td className="py-3.5 px-4 text-stone-500">{tx.date.toLocaleDateString('en-IN')}</td>
                                    <td className="py-3.5 px-3">
                                      <div className="flex items-center space-x-2">
                                        <span className="font-bold text-stone-900">{tx.ref}</span>
                                        {tx.type === 'Bill' && (
                                          <button
                                            onClick={() => openAlterEnquiryModal(tx.details)}
                                            className="p-1 hover:bg-stone-200 rounded text-stone-600 transition"
                                            title="Alter entry"
                                          >
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                          </button>
                                        )}
                                        {tx.type === 'Receipt' && (
                                          <button
                                            onClick={() => handleDeletePayment(tx.id)}
                                            className="p-1 hover:bg-red-50 rounded text-red-655 transition"
                                            title="Delete entry"
                                          >
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-3 text-right font-black text-amber-900">
                                      {tx.debit > 0 ? `₹${tx.debit.toLocaleString('en-IN')}/-` : '-'}
                                    </td>
                                    <td className="py-3.5 px-3 text-right font-black text-emerald-700">
                                      {tx.credit > 0 ? `₹${tx.credit.toLocaleString('en-IN')}/-` : '-'}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-extrabold text-stone-900">
                                      ₹{tx.balance.toLocaleString('en-IN')}/-
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pending Invoices / Payment Allocation List */}
                      <div className="space-y-4 pt-4 border-t border-stone-150">
                        <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest block">Unpaid / Pending Invoices</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {enquiries
                            .filter((e) => e.dealer_phone === selectedLedgerDealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid')
                            .length === 0 ? (
                              <div className="col-span-full text-center py-6 border border-dashed border-stone-200 rounded-2xl text-[10px] text-stone-400 font-bold uppercase">
                                No pending or unpaid invoices.
                              </div>
                            ) : (
                              enquiries
                                .filter((e) => e.dealer_phone === selectedLedgerDealer.phone_number && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent') && e.payment_status !== 'Paid')
                                .map((enq) => (
                                  <div key={enq.id} className="rounded-2xl border border-stone-200 bg-stone-50/20 p-4 space-y-3 flex flex-col justify-between hover:border-amber-800/30 transition">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="flex items-center space-x-1.5">
                                          <span className="text-xs font-black text-stone-900">Ref: ENQ-{enq.id.substring(0,8).toUpperCase()}</span>
                                          <span className="text-[9px] text-stone-400 font-bold">{new Date(enq.created_at).toLocaleDateString('en-IN')}</span>
                                        </div>
                                        <span className="block text-[11px] font-extrabold text-stone-600 mt-1">Amount: ₹{(enq.billed_amount || 0).toLocaleString('en-IN')}/-</span>
                                      </div>
                                      <span className="text-[9px] font-black text-amber-900 bg-amber-50 border border-amber-200/50 rounded-full px-2.5 py-0.5 uppercase tracking-wider">
                                        {enq.payment_status || 'Pending'}
                                      </span>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={() => handleTogglePaymentStatus(enq.id, enq.payment_status || 'Pending')}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-1.5 text-[10px] font-black uppercase tracking-wider transition cursor-pointer active:scale-95"
                                      >
                                        Mark Paid
                                      </button>
                                      <a
                                        href={getWhatsAppInvoiceLinkForEnq(enq)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-stone-900 hover:bg-stone-955 text-white rounded-xl p-1.5 text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center cursor-pointer active:scale-95"
                                        title="Send Bill Details"
                                      >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 10.742l4.737-2.368a1.165 1.165 0 011.037 0l4.737 2.368m-10.51 0a2.33 2.33 0 100 4.66 2.33 2.33 0 000-4.66zm10.51 0a2.33 2.33 0 100 4.66 2.33 2.33 0 000-4.66z" />
                                        </svg>
                                        <span className="ml-1 sm:inline">Send Bill</span>
                                      </a>
                                    </div>
                                  </div>
                                ))
                            )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Sub-View 2: Bill History Ledger */}
            {ledgerSubTab === 'bill_history' && (
              <div className="space-y-5">
                
                {/* Date range filters */}
                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex flex-wrap gap-4 items-center">
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">From Date</label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="block rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-1.5 text-xs font-bold text-stone-850 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">To Date</label>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="block rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-1.5 text-xs font-bold text-stone-855 focus:outline-none"
                      />
                    </div>
                    <div className="pt-4">
                      {(fromDate || toDate) && (
                        <button
                          onClick={() => { setFromDate(''); setToDate(''); }}
                          className="text-[10px] text-amber-850 hover:underline font-bold"
                        >
                          Clear Date Filters
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Period Metrics */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="bg-stone-50 border border-stone-150 rounded-2xl p-3.5 w-28 text-center">
                      <span className="block text-[9px] text-stone-400 font-bold uppercase">Period Sales</span>
                      <span className="text-sm font-black text-stone-900 mt-0.5 block">
                        ₹{enquiries
                          .filter((e) => {
                            if (e.status.toLowerCase() !== 'completed') return false;
                            if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
                            if (toDate && new Date(e.created_at) > new Date(toDate + 'T23:59:59')) return false;
                            return true;
                          })
                          .reduce((sum, e) => sum + (e.billed_amount || 0), 0)
                          .toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 w-28 text-center">
                      <span className="block text-[9px] text-stone-400 font-bold uppercase">Period Paid</span>
                      <span className="text-sm font-black text-emerald-950 mt-0.5 block">
                        ₹{enquiries
                          .filter((e) => {
                            if (e.status.toLowerCase() !== 'completed' || e.payment_status !== 'Paid') return false;
                            if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
                            if (toDate && new Date(e.created_at) > new Date(toDate + 'T23:59:59')) return false;
                            return true;
                          })
                          .reduce((sum, e) => sum + (e.billed_amount || 0), 0)
                          .toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3.5 w-28 text-center">
                      <span className="block text-[9px] text-stone-400 font-bold uppercase">Outstanding</span>
                      <span className="text-sm font-black text-amber-950 mt-0.5 block">
                        ₹{enquiries
                          .filter((e) => {
                            if (e.status.toLowerCase() !== 'completed' || e.payment_status === 'Paid') return false;
                            if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
                            if (toDate && new Date(e.created_at) > new Date(toDate + 'T23:59:59')) return false;
                            return true;
                          })
                          .reduce((sum, e) => sum + (e.billed_amount || 0), 0)
                          .toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Bills Table history list */}
                <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-xs">
                  <table className="min-w-full text-xs text-left font-semibold text-stone-750">
                    <thead className="bg-stone-50 border-b border-stone-200 text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Transaction Date</th>
                        <th className="px-6 py-4">Customer Name</th>
                        <th className="px-6 py-4">Location</th>
                        <th className="px-6 py-4 text-right">Bill Amount</th>
                        <th className="px-6 py-4 text-center">Payment Status</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150 bg-white">
                      {enquiries
                        .filter((e) => {
                          if (e.status.toLowerCase() !== 'completed') return false;
                          if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
                          if (toDate && new Date(e.created_at) > new Date(toDate + 'T23:59:59')) return false;
                          return true;
                        })
                        .length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-16 text-stone-400 font-medium">
                              No bills found in matching range.
                            </td>
                          </tr>
                        ) : (
                          enquiries
                            .filter((e) => {
                              if (e.status.toLowerCase() !== 'completed') return false;
                              if (fromDate && new Date(e.created_at) < new Date(fromDate)) return false;
                              if (toDate && new Date(e.created_at) > new Date(toDate + 'T23:59:59')) return false;
                              return true;
                            })
                            .map((enq) => (
                              <tr key={enq.id} className="hover:bg-stone-50/50">
                                <td className="px-6 py-4.5 whitespace-nowrap font-bold text-stone-900">
                                  {new Date(enq.created_at).toLocaleDateString('en-IN')}
                                </td>
                                <td className="px-6 py-4.5 font-bold text-stone-900">{enq.dealer_name}</td>
                                <td className="px-6 py-4.5">{enq.delivery_location}</td>
                                <td className="px-6 py-4.5 text-right font-bold text-stone-950">
                                  ₹{(enq.billed_amount || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="px-6 py-4.5 text-center">
                                  <span className={`inline-block font-black rounded px-2.5 py-0.5 border ${
                                    enq.payment_status === 'Paid'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                                      : 'border-amber-250 bg-amber-50 text-amber-950'
                                  }`}>
                                    {enq.payment_status || 'Pending'}
                                  </span>
                                </td>
                                <td className="px-6 py-4.5 text-center space-x-2">
                                  <button
                                    onClick={() => handleTogglePaymentStatus(enq.id, enq.payment_status || 'Pending')}
                                    className="text-[10px] font-extrabold bg-stone-100 border border-stone-200 px-2 py-1 rounded transition hover:bg-stone-200"
                                  >
                                    Toggle
                                  </button>
                                  <button
                                    onClick={() => openReturnGoodsModal(enq)}
                                    className="text-[10px] font-extrabold bg-red-50 border border-red-200 px-2 py-1 rounded transition hover:bg-red-100 text-red-650"
                                  >
                                    Return
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

          </div>
        )}
      </main>

      {/* --- INVOICE GENERATION WORKSPACE MODAL ("HD PLY") --- */}
      {activeBillingEnquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-md px-4 py-6 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl border border-stone-200 bg-white shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="wood-gradient text-white py-5 px-6 flex justify-between items-center relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/35 via-amber-950/65 to-stone-950/80" />
              <div className="relative">
                <h2 className="text-2xl font-black tracking-wider">HD PLY</h2>
                <p className="text-[10px] text-amber-300 font-extrabold uppercase tracking-widest mt-0.5">Billing Workspace</p>
              </div>
              <button
                onClick={() => setActiveBillingEnquiry(null)}
                className="relative text-stone-300 hover:text-white rounded-lg p-1"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Customer summary */}
              <div className="rounded-2xl bg-stone-50 border border-stone-100 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-stone-400 font-bold uppercase text-[9px] block">Dealer Name</span>
                  <span className="font-extrabold text-stone-800 text-sm mt-0.5 block">{activeBillingEnquiry.dealer_name}</span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold uppercase text-[9px] block">Phone / WhatsApp</span>
                  <span className="font-extrabold text-stone-850 mt-0.5 block">{activeBillingEnquiry.dealer_phone}</span>
                </div>
                <div>
                  <span className="text-stone-400 font-bold uppercase text-[9px] block">Delivery Location</span>
                  <span className="font-extrabold text-stone-800 mt-0.5 block truncate">{activeBillingEnquiry.delivery_location}</span>
                </div>
              </div>

              {/* Calculator settings (Switch toggles) */}
              <div className="border border-stone-200/80 rounded-2xl p-4 space-y-3 bg-white">
                <h4 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest">Billing Engine Setup</h4>
                
                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                  {/* Mode switch toggle */}
                  <div className="flex items-center space-x-4">
                    <span className="text-xs font-bold text-stone-700">Calculation Method:</span>
                    <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setBillingMode('Feet')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all duration-200 ${
                          billingMode === 'Feet'
                            ? 'bg-amber-800 text-white shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Feet Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingMode('Metre')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all duration-200 ${
                          billingMode === 'Metre'
                            ? 'bg-amber-800 text-white shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Metre Mode
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-stone-500 font-medium max-w-sm">
                    {billingMode === 'Feet'
                      ? 'Calculates total amount based on dimensions in Feet (Length × Width × Qty × Rate).'
                      : 'Automatically converts feet to metres (8ft->2.44m, 7ft->2.14m, etc.) and multiplies Rate per Sq/Ft by 10.764 factor.'}
                  </p>
                </div>
              </div>

              {/* Table billing invoice editor */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest block">Itemized Billing Table</h4>
                
                <div className="border border-stone-200 rounded-2xl overflow-x-auto bg-white shadow-xs">
                  <table className="w-full min-w-[650px] text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                        <th className="py-3 px-4 text-center w-12">S.No</th>
                        <th className="py-3 px-3">Product/Category</th>
                        <th className="py-3 px-3 w-24">Size (FT)</th>
                        <th className="py-3 px-3 text-center w-24">Quantity</th>
                        <th className="py-3 px-3 w-32">Rate (per Sq/Ft)</th>
                        <th className="py-3 px-4 text-right w-36">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-xs font-semibold text-stone-800">
                      {(activeBillingEnquiry.enquiry_items || []).map((item, idx) => {
                        const calculatedAmt = calculateItemAmount(item);
                        return (
                          <tr key={item.id} className="hover:bg-stone-50/40">
                            <td className="py-3.5 px-4 text-center text-stone-400">{idx + 1}</td>
                            <td className="py-3.5 px-3">
                              <span className="font-bold text-stone-900 block">{item.product_name}</span>
                              <span className="text-[10px] text-stone-400 block mt-0.5">Thickness/Grade: {item.thickness}{item.quality ? ` | Quality: ${item.quality}` : ''}</span>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="bg-stone-100 border border-stone-200/50 rounded px-2 py-0.5 text-stone-700">
                                {item.size} ft
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-center font-extrabold text-stone-900">{item.quantity} pcs</td>
                            <td className="py-3.5 px-3">
                              <div className="relative rounded-lg shadow-xs">
                                <span className="absolute inset-y-0 left-2.5 flex items-center text-stone-400">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Rate"
                                  value={itemRates[item.id] || ''}
                                  onChange={(e) => handleRateChange(item.id, parseFloat(e.target.value) || 0)}
                                  className="w-full rounded-lg border border-stone-200 bg-white py-1 pl-6 pr-2 text-xs font-extrabold text-stone-850 focus:border-amber-800 focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-extrabold text-stone-900">
                              ₹{calculatedAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/-
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Adjustments costs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Adjustments boxes */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest">Adjustments & Freight</h4>
                  
                  {/* Transportation Cost Checkbox */}
                  <div className="border border-stone-200 rounded-2xl p-4 bg-white space-y-3">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addTransport}
                        onChange={(e) => setAddTransport(e.target.checked)}
                        className="rounded border-stone-300 text-amber-800 focus:ring-amber-850 h-4.5 w-4.5"
                      />
                      <span className="text-xs font-bold text-stone-700">Add Transport Cost</span>
                    </label>

                    {addTransport && (
                      <div className="relative rounded-lg shadow-xs animate-pop">
                        <span className="absolute inset-y-0 left-3 flex items-center text-stone-400 text-xs font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Transportation fee (Tempo/Lorry)"
                          value={transportFee || ''}
                          onChange={(e) => setTransportFee(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-7 pr-3 text-xs font-bold text-stone-850 focus:border-amber-800 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* GST 18% Checkbox */}
                  <div className="border border-stone-200 rounded-2xl p-4 bg-white">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addGst}
                        onChange={(e) => setAddGst(e.target.checked)}
                        className="rounded border-stone-300 text-amber-800 focus:ring-amber-850 h-4.5 w-4.5"
                      />
                      <span className="text-xs font-bold text-stone-700">Add GST (18%)</span>
                    </label>
                    <p className="text-[10px] text-stone-400 font-medium mt-1">
                      Adds 18% tax on the subtotal (items + transport cost if applicable).
                    </p>
                  </div>
                </div>

                {/* Billing Summary calculation panel */}
                <div className="bg-stone-50 border border-stone-150 rounded-2xl p-5 flex flex-col justify-between">
                  <h4 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest border-b border-stone-200 pb-2">Invoice Summary</h4>
                  
                  <div className="flex-1 py-4 space-y-2.5 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="text-stone-500">Items Subtotal:</span>
                      <span className="text-stone-850">₹{getItemsSubtotal().toLocaleString('en-IN', { maximumFractionDigits: 2 })}/-</span>
                    </div>

                    {addTransport && (
                      <div className="flex justify-between font-semibold">
                        <span className="text-stone-500">Transport/Freight:</span>
                        <span className="text-stone-850">₹{transportFee.toLocaleString('en-IN')}/-</span>
                      </div>
                    )}

                    {addGst && (
                      <div className="flex justify-between font-semibold">
                        <span className="text-stone-500">GST (18%):</span>
                        <span className="text-stone-850">
                          ₹{Math.round((getItemsSubtotal() + (addTransport ? transportFee : 0)) * 0.18).toLocaleString('en-IN')}/-
                        </span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-stone-200 flex justify-between items-center text-sm font-black">
                      <span className="text-stone-900">Grand Total:</span>
                      <span className="text-amber-800 text-lg">
                        ₹{Math.round(
                          getItemsSubtotal() + 
                          (addTransport ? transportFee : 0) + 
                          (addGst ? (getItemsSubtotal() + (addTransport ? transportFee : 0)) * 0.18 : 0)
                        ).toLocaleString('en-IN')}/-
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleOpenDraftPreview}
                    disabled={getItemsSubtotal() === 0}
                    className="w-full bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3 text-xs font-bold shadow-md shadow-amber-800/10 transition disabled:bg-stone-300 disabled:shadow-none flex items-center justify-center space-x-2"
                  >
                    <span>Preview Bill Draft</span>
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* --- EDITABLE PRE-SENDING MODAL & DRAFT VIEW --- */}
      {showDraftPreview && activeBillingEnquiry && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-stone-950/70 backdrop-blur-md px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-pop my-auto">
            
            <div className="flex justify-between items-center border-b border-stone-150 pb-3.5 mb-4">
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase">Pre-Sending Draft Review</h3>
                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">Confirm Invoice Specifications</p>
              </div>
              <button
                onClick={() => {
                  setShowDraftPreview(false);
                  setIsBillFinalized(false);
                }}
                className="text-stone-400 hover:text-stone-700"
              >
                <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Draft Container */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              
              {/* Draft Box View to Capture via html2canvas */}
              <div 
                ref={invoiceCaptureRef}
                id="hd-ply-invoice-capture"
                className="rounded-2xl border-4 border-stone-950 bg-white p-6 font-mono text-[11px] leading-relaxed text-stone-900 space-y-4 shadow-sm"
              >
                
                {/* Heading */}
                <div className="text-center font-black text-xl tracking-widest text-stone-950 border-b-4 border-stone-950 pb-2 uppercase">
                  HD PLYWOOD
                </div>

                <div className="grid grid-cols-2 gap-4 text-[10px] font-black uppercase border-b-2 border-stone-950 pb-2">
                  <div>
                    <div>Dealer Name : {activeBillingEnquiry.dealer_name}</div>
                    <div>Phone Number: {activeBillingEnquiry.dealer_phone}</div>
                    <div>Calculation : {billingMode} Mode</div>
                  </div>
                  <div className="text-right">
                    <div>Ref Order ID: {activeBillingEnquiry.id.substring(0, 8).toUpperCase()}</div>
                    <div>Invoice Date: {new Date().toLocaleDateString('en-IN')}</div>
                    <div>Payment Status: <span className="underline font-black">{activeBillingEnquiry.payment_status || 'Pending'}</span></div>
                  </div>
                </div>

                {/* Items Grid */}
                <div className="space-y-1">
                  <div className="grid grid-cols-12 font-black uppercase text-[10px] border-b-2 border-stone-950 pb-1 mb-1">
                    <span className="col-span-1">#</span>
                    <span className="col-span-5">Item Detail</span>
                    <span className="col-span-2 text-center">Qty</span>
                    <span className="col-span-2 text-right">Rate</span>
                    <span className="col-span-2 text-right">Amount</span>
                  </div>

                  {(activeBillingEnquiry.enquiry_items || []).map((item, idx) => {
                    const amt = calculateItemAmount(item);
                    return (
                      <div key={item.id} className="grid grid-cols-12 font-extrabold border-b border-stone-200 py-1 items-center">
                        <span className="col-span-1 font-black">{idx + 1}</span>
                        <span className="col-span-5 font-black">
                          {item.product_name}
                          <span className="block text-[8px] font-black text-stone-500">
                            {item.size} ft | {item.thickness} {item.quality ? `| ${item.quality}` : ''}
                          </span>
                        </span>
                        <span className="col-span-2 text-center font-black">{item.quantity}</span>
                        <span className="col-span-2 text-right font-black">₹{itemRates[item.id] || 0}</span>
                        <span className="col-span-2 text-right font-black">₹{Math.round(amt).toLocaleString('en-IN')}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Calculations grid details */}
                <div className="border-t-2 border-stone-950 pt-2 space-y-1 font-black">
                  <div className="flex justify-between font-black">
                    <span>Items Subtotal:</span>
                    <span>₹{Math.round(getItemsSubtotal()).toLocaleString('en-IN')}/-</span>
                  </div>
                  {addTransport && (
                    <div className="flex justify-between font-black">
                      <span>Transport Charge:</span>
                      <span>₹{transportFee.toLocaleString('en-IN')}/-</span>
                    </div>
                  )}
                  {addGst && (
                    <div className="flex justify-between font-black">
                      <span>GST (18%):</span>
                      <span>₹{Math.round((getItemsSubtotal() + (addTransport ? transportFee : 0)) * 0.18).toLocaleString('en-IN')}/-</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm border-t-4 border-double border-stone-950 pt-2">
                    <span>Grand Total:</span>
                    <span>₹{finalGrandTotal.toLocaleString('en-IN')}/-</span>
                  </div>
                </div>

                {/* Additional remarks/notes */}
                {draftCustomNotes.trim() && (
                  <div className="pt-2 border-t-2 border-dashed border-stone-400 font-black">
                    <div>Admin Notes:</div>
                    <p className="text-[10px] italic mt-0.5 text-stone-700">"{draftCustomNotes.trim()}"</p>
                  </div>
                )}
              </div>

              {/* Editable admin remarks/notes */}
              {!isBillFinalized && (
                <div className="space-y-1.5 animate-pop">
                  <label htmlFor="draft-notes" className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                    Add Invoice Remarks / Custom Notes
                  </label>
                  <textarea
                    id="draft-notes"
                    rows={2.5}
                    value={draftCustomNotes}
                    onChange={(e) => setDraftCustomNotes(e.target.value)}
                    placeholder="e.g. 50% advance received. Goods loaded. Dispatch in progress."
                    className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-800 focus:outline-none resize-none shadow-xs"
                  />
                </div>
              )}

            </div>

            {/* Bottom Actions panel */}
            <div className="mt-5 border-t border-stone-150 pt-4 space-y-2">
              {!isBillFinalized ? (
                <button
                  onClick={handleSaveAndFinalizeBill}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3.5 text-xs font-bold shadow-md shadow-amber-800/10 transition"
                >
                  Save & Finalize Bill
                </button>
              ) : (
                <div className="space-y-2.5 animate-pop">
                  {/* Generate and download digital bill image */}
                  <button
                    onClick={handleGenerateInvoiceImage}
                    disabled={isCapturingBill}
                    className="w-full flex items-center justify-center space-x-2 bg-stone-900 hover:bg-stone-950 text-white rounded-xl py-3.5 text-xs font-bold shadow-md transition"
                  >
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>{isCapturingBill ? 'Generating Digital Receipt...' : 'Download Invoice Image'}</span>
                  </button>

                  {/* WhatsApp send triggers */}
                  <button
                    onClick={async () => {
                      if (!activeBillingEnquiry) return;
                      await handleGenerateInvoiceImage();
                      try {
                        const { error } = await supabase
                          .from('enquiries')
                          .update({ status: 'Sent' })
                          .eq('id', activeBillingEnquiry.id);
                        if (!error) {
                          setEnquiries(prev => prev.map(e => e.id === activeBillingEnquiry.id ? { ...e, status: 'Sent' } : e));
                        }
                      } catch (err) {
                        console.error('Failed to update status to Sent:', err);
                      }
                      const cleanPhone = activeBillingEnquiry.dealer_phone.replace(/[^0-9]/g, '');
                      const text = `HD PLYWOOD - Invoice generated successfully for your recent order. Total Amount: ₹${finalGrandTotal}/-`;
                      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
                      window.open(waUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 text-xs font-bold shadow-md shadow-emerald-600/10 transition"
                  >
                    <svg className="h-4.5 w-4.5 fill-white" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.437.002 9.861-4.379 9.864-9.799.002-2.623-1.023-5.086-2.885-6.948C16.39 2.017 13.945 1.01 11.99 1.012c-5.433 0-9.858 4.38-9.863 9.8-.001 2.016.524 3.99 1.522 5.722l-.993 3.624 3.992-.998zM18.156 14.8c-.33-.164-1.951-.955-2.25-1.066-.3-.11-.518-.165-.736.165-.218.33-.844 1.066-1.035 1.284-.19.217-.382.244-.712.079-.33-.164-1.392-.51-2.653-1.632-1.002-.89-1.677-1.99-1.874-2.318-.197-.33-.02-.508.145-.671.148-.147.33-.382.495-.572.164-.19.219-.328.329-.546.11-.218.055-.41-.027-.573-.082-.164-.736-1.754-1.008-2.409-.265-.638-.53-.55-.736-.56-.19-.01-.408-.01-.626-.01-.218 0-.573.082-.872.41-.3.33-1.145 1.117-1.145 2.727 0 1.61 1.173 3.167 1.336 3.385.163.218 2.3 3.498 5.568 4.908.778.335 1.385.535 1.859.684.78.247 1.49.212 2.052.128.625-.094 1.951-.793 2.224-1.558.272-.765.272-1.42.19-1.557-.081-.137-.299-.219-.628-.383z"/>
                    </svg>
                    <span>Send Invoice Details to WhatsApp</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowDraftPreview(false);
                      setIsBillFinalized(false);
                      setActiveBillingEnquiry(null);
                    }}
                    className="w-full border border-stone-200 text-stone-650 bg-white rounded-xl py-3 text-xs font-bold hover:bg-stone-50 transition"
                  >
                    Close Invoice Workspace
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- GOODS RETURN MODAL OVERLAY --- */}
      {returnModalOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-stone-955/70 backdrop-blur-md px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-pop my-auto">
            
            <div className="flex justify-between items-center border-b border-stone-150 pb-3 mb-4">
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase">Return Goods</h3>
                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">Select items and transport adjustments</p>
              </div>
              <button 
                onClick={() => setReturnModalOpen(false)} 
                className="text-stone-400 hover:text-stone-700"
              >
                <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              <div className="space-y-3">
                {returnItems.map((item, idx) => (
                  <div key={item.itemId} className="rounded-xl border border-stone-100 bg-stone-50/50 p-3 space-y-2">
                    <div className="font-bold text-stone-900">{item.name} ({item.thickness}, {item.size} ft)</div>
                    <div className="text-[10px] text-stone-500 font-medium">
                      Rate: ₹{item.rate}/- | Original Qty: {item.maxQty} sheets
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Qty to Return:</span>
                      <input
                        type="number"
                        min="0"
                        max={item.maxQty}
                        value={item.returnedQty}
                        onChange={(e) => {
                          const val = Math.min(item.maxQty, Math.max(0, parseInt(e.target.value) || 0));
                          setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, returnedQty: val } : ri));
                        }}
                        className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-center text-stone-850"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-stone-100">
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">
                  Return Journey Transport Fee (Deducted from balance)
                </label>
                <input
                  type="number"
                  min="0"
                  value={returnTransportCost}
                  onChange={(e) => setReturnTransportCost(Math.max(0, parseInt(e.target.value) || 0))}
                  className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3.5 py-2.5 text-xs font-bold text-stone-905"
                />
              </div>
            </div>

            <button
              onClick={() => {
                handleReturnGoods(returnEnquiryId, returnItems, returnTransportCost, returnOriginalBilledAmount);
                setReturnModalOpen(false);
              }}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3.5 text-xs font-bold shadow-md transition mt-4"
            >
              Confirm Goods Return
            </button>
          </div>
        </div>
      )}

      {/* --- ALTER ENTRY MODAL OVERLAY --- */}
      {alterModalOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-stone-955/70 backdrop-blur-md px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-pop my-auto">
            
            <div className="flex justify-between items-center border-b border-stone-150 pb-3 mb-4">
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase">
                  {alterStatus === 'PAYMENT' ? 'Alter Payment Log' : 'Alter Entry Desk'}
                </h3>
                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                  {alterStatus === 'PAYMENT' ? 'Update manual receipt logs' : 'Correct typos, items, quantities and rates'}
                </p>
              </div>
              <button 
                onClick={() => setAlterModalOpen(false)} 
                className="text-stone-400 hover:text-stone-700"
              >
                <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {alterStatus === 'PAYMENT' ? (
                <div className="space-y-3">
                  <div>
                    <span className="block text-[8px] font-extrabold text-stone-400 uppercase tracking-widest">Dealer Profile</span>
                    <span className="block font-bold text-stone-900 mt-0.5">{alterDealerName} ({alterDealerPhone})</span>
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Payment Reference</label>
                    <select
                      value={alterComments}
                      onChange={(e) => setAlterComments(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-900 focus:outline-none"
                    >
                      <option value="advance">Advance Payment (No Reference)</option>
                      {enquiries
                        .filter((e) => e.dealer_phone === alterDealerPhone && (e.status.toLowerCase() === 'completed' || e.status.toLowerCase() === 'sent'))
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            Ref: {e.id.substring(0,8).toUpperCase()} - ₹{(e.billed_amount || 0).toLocaleString()}/-
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Payment Amount (₹)</label>
                    <input
                      type="number"
                      value={alterBilledAmount || 0}
                      onChange={(e) => setAlterBilledAmount(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-900 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Dealer Business Name</label>
                      <input
                        type="text"
                        value={alterDealerName}
                        onChange={(e) => setAlterDealerName(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-905"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Delivery Location</label>
                      <input
                        type="text"
                        value={alterDeliveryLocation}
                        onChange={(e) => setAlterDeliveryLocation(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-905"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Order Comments / Notes</label>
                    <textarea
                      value={alterComments}
                      onChange={(e) => setAlterComments(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-905 h-16 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Order Status</label>
                      <select
                        value={alterStatus}
                        onChange={(e) => setAlterStatus(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-2 py-2 text-xs font-bold text-stone-900"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Completed">Completed</option>
                        <option value="Sent">Sent</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Payment Status</label>
                      <select
                        value={alterPaymentStatus}
                        onChange={(e) => setAlterPaymentStatus(e.target.value)}
                        className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-2 py-2 text-xs font-bold text-stone-900"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold text-stone-500 uppercase tracking-wider mb-1">Billed Amount (₹)</label>
                      <input
                        type="number"
                        placeholder="Not Billed Yet"
                        value={alterBilledAmount === null ? '' : alterBilledAmount}
                        onChange={(e) => setAlterBilledAmount(e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                        className="block w-full rounded-xl border border-stone-200 bg-stone-50/20 px-3 py-2 text-xs font-bold text-stone-905"
                      />
                    </div>
                  </div>

                  <div className="space-y-3.5 pt-3 border-t border-stone-100">
                    <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-widest">Order Material Items</span>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                      {alterItems.map((item, idx) => (
                        <div key={item.id} className="rounded-xl border border-stone-150 bg-stone-50/40 p-3 space-y-2">
                          <div className="font-bold text-stone-850">{item.product_name} ({item.thickness}, {item.size} ft)</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[8px] font-extrabold text-stone-400 uppercase mb-0.5">Quantity (sheets)</label>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value) || 1);
                                  setAlterItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                                }}
                                className="block w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-extrabold text-stone-400 uppercase mb-0.5">Rate (₹)</label>
                              <input
                                type="number"
                                min="0"
                                value={item.rate}
                                onChange={(e) => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                                  setAlterItems(prev => prev.map((it, i) => i === idx ? { ...it, rate: val } : it));
                                }}
                                className="block w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-900"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSaveAlterEnquiry}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white rounded-xl py-3.5 text-xs font-bold shadow-md transition mt-4"
            >
              Save Altered Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
