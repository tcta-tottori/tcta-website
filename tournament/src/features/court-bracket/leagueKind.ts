/** リーグ戦の種目か（ドローの drawType。古いデータで drawType が無いときは種目名で見分ける） */
export function isLeagueKind(eventName: string, drawType: string | undefined): boolean {
  if (drawType === 'roundRobin') return true;
  if (drawType === 'tournament') return false;
  return /リーグ/.test(eventName) && !/トーナメント/.test(eventName);
}
