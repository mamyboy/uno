/** Thai text for server error codes (unknown codes pass through unchanged). */
const TH: Record<string, string> = {
  NAME_TAKEN: 'มีชื่อนี้อยู่ในห้องแล้ว กรุณาเปลี่ยนชื่อ',
  ROOM_NOT_FOUND: 'ไม่พบห้องนี้',
  NOT_YOUR_TURN: 'ยังไม่ถึงตาคุณ',
  STALE_TURN: 'ตานี้ผ่านไปแล้ว',
  CARD_NOT_PLAYABLE: 'ไพ่ใบนี้ลงไม่ได้',
  MUST_COUNTER_OR_DRAW: 'ต้องลงไพ่จั่วตอบคอมโบ หรือกดจั่วรับ',
  HAS_PLAYABLE_CARD: 'คุณยังมีไพ่ที่ลงได้',
  CARDS_MUST_MATCH_VALUE: 'ลงหลายใบต้องเป็นค่าเดียวกัน',
  DRAW_TWO_COLOR_MISMATCH: 'Draw Two ต้องสีตรงกับสีที่เลือก',
  WILD_DRAW_NO_DRAW_TWO: 'Wild Draw กับ Draw Two ลงพร้อมกันไม่ได้',
  REFLECT_ONLY_VS_COMBO: 'ไพ่สะท้อนใช้ได้เฉพาะตอนโดนคอมโบ',
  SHIELD_ONLY_VS_COMBO: 'ไพ่โล่ใช้ได้เฉพาะตอนโดนคอมโบ',
  AVATAR_LOCKED_IN_GAME: 'เปลี่ยนรูปโปรไฟล์ได้ตอนอยู่นอกเกมเท่านั้น',
  NOT_ENOUGH_PLAYERS: 'ผู้เล่นยังไม่พอ',
  PLAYER_DISCONNECTED: 'มีผู้เล่นหลุดการเชื่อมต่ออยู่',
  NOT_HOST: 'เฉพาะเจ้าของห้อง',
  SESSION_INVALID: 'Session หมดอายุ กรุณาเข้าห้องใหม่',
};
export const errText = (code: string | null | undefined) => (code ? TH[code] ?? code : '');
