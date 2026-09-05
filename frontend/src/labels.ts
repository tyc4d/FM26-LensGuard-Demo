// Translate display labels only. API values, model output, and user input stay intact.
const labels: Record<string, string> = {
  call_phone: '撥打電話', navigate: '提供方向', provide_direction: '回答方向', open_url: '開啟網址',
  restaurant_reservation: '餐廳訂位', safety_advice: '安全建議', none: '不採取行動',
  answer_question: '回答問題', phone_number: '電話號碼', scene_text: '場景文字',
  proposed: '已提出', allowed: '已允許', blocked: '已阻擋', executed: '已模擬執行',
  running: '執行中', completed: '已完成', failed: '執行失敗',
  ready: '已就緒', unloaded: '尚未載入', loading: '載入中', processing: '處理中',
  unavailable: '無法使用', error: '發生錯誤', warmed: '已預熱',
  user: '使用者', camera: '相機', model: '模型', system: '系統',
  task: '任務授權', observation: '觀察資料', delegated: '明確授權',
  evidence: '支持證據', entity: '實體資料', instruction: '嵌入指令', instruction_derived: '指令衍生', unknown: '語意尚未確認',
  EVIDENCE: '支持證據', GROUNDED_EVIDENCE: '有依據的場景資訊', USER_DELEGATED: '使用者明確授權',
  INFORMATIONAL_OUTPUT: '資訊回答', SIDE_EFFECT_ARGUMENT: '外部行動參數',
  RETAIN: '保留證據', DENY_INSTRUCTION_INFLUENCE: '拒絕指令影響', UNSUPPORTED: '尚無支持證據',
  restaurant_reservation_phone: '餐廳訂位電話', card_phone: '名片電話', exit_direction: '出口方向',
  observed_restaurant: '眼前餐廳', observed_card: '眼前名片',
  DELEGATED: '明確授權', OBSERVATION_ONLY: '僅供觀察', NONE: '無',
  EXTERNAL_ACTION_TARGET: '外部行動目標授權', NAVIGATION_DIRECTION: '方向指示授權',
  ALLOW: '允許', ALLOWED: '已允許', BLOCK: '阻擋', BLOCKED: '已阻擋',
  DENY: '拒絕', WARN: '警告', CONFIRM: '需要確認', EXECUTED: '已模擬執行',
  BYPASS: '略過授權', BYPASSED: '已略過授權',
  CAMERA: '相機', IMAGE: '影像', 'LOCAL VLM': '本機視覺語言模型',
  'USER REQUEST': '使用者請求', delegation: '明確授權', 'No arguments': '無參數',
  source: '資料來源', 'visual region': '影像區域', 'derived value': '衍生值',
  'action argument': '行動參數', 'task authority': '任務授權',
  'explicit authorization': '明確授權', 'policy decision': '規則判定',
  'simulation outcome': '模擬結果', 'camera input': '相機輸入',
  'uploaded_image input': '上傳影像輸入', 'real inference': '真實模型推論',
  'model-derived; unverified': '模型產生；尚未驗證', 'scoped delegation': '限定範圍授權',
  'authorization / simulation': '授權／模擬',
};

const fields: Record<string, string> = {
  number: '電話號碼', target_number: '電話號碼', restaurant: '餐廳', time: '訂位時間',
  party_size: '用餐人數', direction: '方向', destination: '目的地', url: '網址',
  advice: '建議', message: '訊息', reason: '原因', text: '文字',
};

export function displayLabel(value: string | null | undefined): string {
  return value ? labels[value] ?? value : '—';
}

export function fieldLabel(path: string): string {
  if (fields[path]) return fields[path];
  if (labels[path]) return labels[path];
  const [tool, argument, ...rest] = path.split('.');
  if (['call_phone', 'navigate', 'provide_direction', 'open_url', 'restaurant_reservation', 'safety_advice', 'answer_question'].includes(tool) && argument && rest.length === 0) {
    return `${labels[tool]}／${fields[argument] ?? argument}`;
  }
  return path;
}

export function traceLabel(value: string): string {
  return value.split(', ').map(part => labels[part] ?? fieldLabel(part)).join('、');
}

const events: Record<string, string> = {
  queued: '等待分析', 'frame.received': '收到影像',
  'inference.started': '開始模型推論', 'inference.completed': '模型推論完成',
  'action.parsed': '行動解析完成', 'perception.scene_analyzed': '場景分析完成',
  'perception.text_extracted': '文字擷取完成', 'model.action_proposed': '模型提出行動',
  'provenance.attached': '附上來源紀錄', 'policy.evaluated': '授權判定完成',
  'policy.bypassed': '略過授權判定', 'action.allowed': '行動已允許',
  'action.blocked': '行動已阻擋', 'action.executed': '行動已模擬執行',
  'runtime.failed': '分析失敗', 'runtime.cancelled': '分析已取消',
};

export function eventLabel(value: string): string {
  return events[value] ?? value;
}

const timings: Record<string, string> = {
  frame_capture_ms: '影像擷取', demo_upload_receive_ms: '接收上傳影像',
  prototype_inference_ms: '模型推論', prototype_generation_ms: '模型生成',
  prototype_parsing_and_metadata_ms: '解析與中繼資料處理',
  prototype_policy_ms: '授權判定', prototype_total_ms: '推論服務總耗時',
  prototype_request_ms: '推論服務往返', demo_runtime_ms: '分析流程總耗時',
  browser_upload_roundtrip_ms: '瀏覽器上傳往返', browser_total_ms: '瀏覽器總耗時',
};

export function timingLabel(value: string): string {
  return timings[value] ?? value;
}

const scenarios: Record<string, string> = {
  'reservation-injection': '訂位提示注入', 'navigation-injection': '導航提示注入',
  'explicit-delegation': '使用者明確授權',
  'clean-navigation': '乾淨出口觀察', 'reservation-delegation': '餐廳訂位電話授權',
};

export function scenarioLabel(id: string, fallback: string): string {
  return scenarios[id] ?? fallback;
}

export function directionLabel(value: string): string {
  const directions: Record<string, string> = {
    LEFT: '左', RIGHT: '右', STRAIGHT: '直行', BACK: '後方',
    NORTH: '北', SOUTH: '南', EAST: '東', WEST: '西',
    NORTHEAST: '東北', NORTHWEST: '西北', SOUTHEAST: '東南', SOUTHWEST: '西南',
  };
  return directions[value.toUpperCase()] ?? value;
}
