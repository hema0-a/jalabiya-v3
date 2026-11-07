/**
 * Jalabiya-v3 - Professional Workshop Extensions
 * Developed for precise workshop management (Vanilla JS)
 */

// ==========================================
// 1. نظام مراسلة الواتساب المتقدم (WhatsApp Quick Messaging)
// ==========================================
export function sendWorkshopWhatsApp(customerPhone, customerName, orderDetails) {
    if (!customerPhone) {
        console.error("خطأ: رقم الهاتف غير متوفر لهذا العميل.");
        return { success: false, message: "رقم الهاتف غير متاح" };
    }

    let cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '20' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('20')) {
        cleanPhone = '20' + cleanPhone;
    }

    const message = `مرحباً بك يا أستاذ *${customerName}* ✂️\n\n` +
                    `نحيطك علماً بتفاصيل جلابيتك في الورشة:\n` +
                    `📌 *حالة الطلب:* ${orderDetails.status || 'قيد العمل'}\n` +
                    `💰 *المبلغ المتبقي:* ${orderDetails.remainingAmount || 0} جنيه\n` +
                    `📅 *موعد التسليم المقترح:* ${orderDetails.deliveryDate || 'قريباً'}\n\n` +
                    `شكراً لثقتك الغالية في ورشتنا!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
    return { success: true, url: whatsappUrl };
}


// ==========================================
// 3. نظام مهلة الأمان والجدولة الذكية (Safety Margin Scheduling)
// ==========================================
export function calculateSmartDeliveryDate(orderDateStr, processingDays, safetyMarginDays = 2) {
    let orderDate = new Date(orderDateStr);
    if (isNaN(orderDate.getTime())) {
        orderDate = new Date();
    }

    let totalDays = parseInt(processingDays || 3) + parseInt(safetyMarginDays || 2);
    orderDate.setDate(orderDate.getDate() + totalDays);

    const year = orderDate.getFullYear();
    const month = String(orderDate.getMonth() + 1).padStart(2, '0');
    const day = String(orderDate.getDate()).padStart(2, '0');

    return {
        formattedDate: `${year}-${month}-${day}`,
        totalDaysAllocated: totalDays,
        rawDate: orderDate
    };
}


// ==========================================
// 4. حاسبة الدخل اليومي المستهدف المتقدمة (Daily Target Income Engine)
// ==========================================
export function analyzeDailyTargetIncome(ordersList, targetDailyIncome) {
    let target = parseFloat(targetDailyIncome) || 500;
    let accumulatedRevenue = 0;
    let selectedOrders = [];

    let sortedOrders = [...ordersList].sort((a, b) => {
        let remA = (parseFloat(a.totalAmount) || 0) - (parseFloat(a.deposit) || 0);
        let remB = (parseFloat(b.totalAmount) || 0) - (parseFloat(b.deposit) || 0);
        return remB - remA;
    });

    for (let order of sortedOrders) {
        let remaining = (parseFloat(order.totalAmount) || 0) - (parseFloat(order.deposit) || 0);
        
        if (accumulatedRevenue < target) {
            accumulatedRevenue += remaining;
            selectedOrders.push({
                ...order,
                calculatedRemaining: remaining
            });
        }
    }

    let progressPercentage = Math.min(Math.round((accumulatedRevenue / target) * 100), 100);

    return {
        targetIncome: target,
        projectedRevenue: accumulatedRevenue,
        isTargetMet: accumulatedRevenue >= target,
        progressPercentage: progressPercentage,
        priorityOrders: selectedOrders
    };
}
