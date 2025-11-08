/**
 * woori Cloud Functions (FCM Auto Notifications)
 * 2025-11 완성본
 * --------------------------------------------
 * 기능:
 *  - notifications 컬렉션 생성 시 자동 트리거
 *  - 해당 taskId의 담당자/생성자에게 FCM 푸시 전송
 *  - 알림 메시지에 따라 title/body 자동 구성
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/**
 *  Firestore → notifications 트리거
 */
export const sendWardNotifications = onDocumentCreated(
  "notifications/{notiId}",
  async (event) => {
    try {
      const noti = event.data?.data();
      if (!noti) return logger.warn("❗ 알림 문서 데이터 없음");

      const { taskId, message, type, user } = noti;
      logger.info("📢 새 알림 감지:", { taskId, type, user });

      // 해당 업무(task) 문서 조회
      const taskSnap = await db.doc(`wardTasks/${taskId}`).get();
      if (!taskSnap.exists) return logger.warn("해당 업무 없음:", taskId);

      const task = taskSnap.data();
      const createdByUid = task?.createdBy?.uid;
      const assignedUid = task?.assignedTo?.uid;

      // 대상자: 업무 작성자 + 담당자
      const targetUids = new Set();
      if (createdByUid) targetUids.add(createdByUid);
      if (assignedUid) targetUids.add(assignedUid);

      // 본인이 쓴 알림은 제외
      if (user) targetUids.delete(user);

      // 각 대상자별 토큰 수집
      const tokens = new Set();
      for (const uid of targetUids) {
        const col = await db.collection(`users/${uid}/fcmTokens`).get();
        col.forEach((doc) => {
          const data = doc.data();
          if (!data.disabled && data.token) tokens.add(doc.id);
        });
      }

      if (tokens.size === 0) {
        logger.info("🎯 전송할 FCM 토큰 없음");
        return;
      }

      // 메시지 구성
      const title =
        type === "ward"
          ? "업무 상태 변경 알림"
          : type === "surgery"
          ? "수술 상태 알림"
          : "우리병원 알림";
      const body = message || "새로운 알림이 있습니다.";

      const payload = {
        notification: { title, body },
        data: {
          taskId: taskId || "",
          type: type || "general",
          body,
        },
      };

      // FCM 전송
      const res = await messaging.sendEachForMulticast({
        tokens: [...tokens],
        ...payload,
      });

      logger.info(`✅ ${tokens.size}개 토큰에 푸시 전송 완료`, res.successCount);
    } catch (e) {
      logger.error("🔥 sendWardNotifications 실패", e);
    }
  }
);

/**
 * (선택) 수술 상태 변경 알림
 * surgeries 컬렉션 상태 변경 시 알림 생성
 */
export const notifySurgeryUpdate = onDocumentCreated(
  "surgeries/{surgeryId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    try {
      const message = `${data.surgeryName || "수술"} 상태가 ${data.status}로 변경되었습니다.`;

      // 생성자에게 알림 등록
      await db.collection("notifications").add({
        taskId: event.params.surgeryId,
        message,
        type: "surgery",
        at: new Date(),
        user: data.createdBy?.uid || null,
      });

      logger.info("🩺 수술 알림 기록 생성:", event.params.surgeryId);
    } catch (err) {
      logger.error("❌ notifySurgeryUpdate 오류:", err);
    }
  }
);

/**
 * (선택) 오래된 notifications 정리 (1일 1회)
 * Firebase Scheduler에서 호출
 */
import { onSchedule } from "firebase-functions/v2/scheduler";

export const cleanupOldNotifications = onSchedule("every 24 hours", async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7일 전
  const q = await db
    .collection("notifications")
    .where("at", "<", cutoff)
    .get();

  let delCount = 0;
  const batch = db.batch();
  q.docs.forEach((doc) => {
    batch.delete(doc.ref);
    delCount++;
  });
  if (delCount > 0) {
    await batch.commit();
    logger.info(`🧹 ${delCount}개의 오래된 알림 문서 삭제 완료`);
  } else {
    logger.info("🧹 오래된 알림 없음");
  }
});
