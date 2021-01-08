const MS_OF_HOUR = 3600000;
const MS_OF_MINUTE = 60000;
export function getDurationText(ms: number): string {
  let result = "";

  if (ms > MS_OF_HOUR) {
    // 超过1小时
    if (result !== "") {
      result += " ";
    }
    const hour = Math.floor(ms / MS_OF_HOUR);
    result += hour + "hr";
    if (hour > 1) {
      result += "s";
    }
    ms %= MS_OF_HOUR;
  }
  if (ms > MS_OF_MINUTE) {
    if (result !== "") {
      result += " ";
    }
    // 超过1分钟
    const minute = Math.floor(ms / MS_OF_MINUTE);
    result += minute + "min";
    if (minute > 1) {
      result += "s";
    }
    ms %= MS_OF_MINUTE;
  }
  if (result !== "") {
    return result;
  }
  const s = Math.floor(ms / 1000);
  result += s + "sec";
  if (s > 1) {
    result += "s";
  }
  return result;
}
