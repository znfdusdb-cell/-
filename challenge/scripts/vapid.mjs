// 웹 푸시용 VAPID 키 1회 생성: npm run vapid  → 출력값을 환경변수에 넣는다.
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
