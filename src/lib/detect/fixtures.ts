// Real bank SMS shared by the user on 27 Nov 2026, with account numbers, card numbers,
// reference numbers and mandate ids replaced. Line breaks are kept as the SMS app shows them.
export const SAMPLES = {
  hdfcUpiSports: {
    pkg: 'com.google.android.apps.messaging', title: 'VM-HDFCBK-T',
    text: 'Sent Rs.2371.00\nFrom HDFC Bank A/C *1111\nTo SACHDEV SPORTS JUBILEE 1\nOn 26/11/26\nRef 300000000001\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808',
    postedAt: new Date(2026, 10, 26, 18, 36).getTime(),
  },
  hdfcUpiSwiggy: {
    pkg: 'com.google.android.apps.messaging', title: 'JX-HDFCBK-T',
    text: 'Sent Rs.338.00\nFrom HDFC Bank A/C *1111\nTo Swiggy Ltd\nOn 27/11/26\nRef 700000000002\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808',
    postedAt: new Date(2026, 10, 27, 20, 54).getTime(),
  },
  canaraCard: {
    pkg: 'com.google.android.apps.messaging', title: 'AX-CANBNK-S',
    text: 'INR 2,194.00 spent on CanaraBank CreditCard XX4444: APTAMITRA HEALTHCARE P on 27-NOV-26 14:37:47.Ref.600000000003. Avl limit INR 447,806.00.If fraud,dial 1930',
    postedAt: new Date(2026, 10, 27, 14, 37, 50).getTime(),
  },
  hdfcMandate: {
    pkg: 'com.google.android.apps.messaging', title: 'AD-HDFCBK-S',
    text: 'E-Mandate!\nRs.85.00 will be deducted on 28/11/26, 00:00:00\nFor SAFE GOLD mandate\nUMN 0000000000000000000000000000000@ybl\nMaintain Balance\n-HDFC Bank',
    postedAt: new Date(2026, 10, 27, 9, 0).getTime(),
  },
}
