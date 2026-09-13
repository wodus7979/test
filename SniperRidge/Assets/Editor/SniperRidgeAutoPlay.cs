// 에디터 자동 실행 검증 도구.
// 프로젝트 루트의 Logs/autoplay.txt 가 생기면 Unity 가 스스로 Play → 모드 선택·출전 → 스크린샷 → Play 종료를 한다.
// 사람이 키를 누르지 않아도 (원격 세션, 백그라운드 세션) 실제 화면을 PNG 로 남겨 화질 변경을 확인하기 위한 것이다.
//
// 요청 파일 형식 (한 줄에 key=value):
//   mode=9        시작 메뉴 행 번호. 0 저격 1 지정사수 2 돌격 3 경기관총 4 기관단총 5 샷건 6 권총 7 헬기 8 K2 전차 9 도시 FPS
//   wait=8        출전 후 첫 스크린샷까지 기다리는 초 (지형·에셋 생성 시간)
//   explosion=1   스크린샷 직전 카메라 앞 15m 에 CombatVfx.Explosion 을 터뜨려 파티클 셰이더를 검사한다
//   supersize=2   ScreenCapture 배율 (Game 뷰가 작을 때 2 이상)
//   tag=city      파일 이름에 붙는 이름표
//   quit=1        끝나면 Play 를 끈다
// 결과: Screenshots/auto_<tag>_on.png (후처리 켬), auto_<tag>_off.png (후처리 끔), Logs/autoplay_result.txt (에러 로그 포함).
// 요청 파일은 처리 후 삭제된다. Logs/ 와 Screenshots/ 는 저장소에 올라가지 않는다.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    static class SniperRidgeAutoPlay
    {
        const string RequestPath = "Logs/autoplay.txt";
        const string ResultPath = "Logs/autoplay_result.txt";
        const string PhaseKey = "SniperRidge.AutoPlay.Phase";

        static double lastPoll, phaseStart;
        static int step;
        static Dictionary<string, string> request;
        static readonly List<string> errors = new List<string>();
        static readonly List<string> results = new List<string>();
        static bool logHooked,scenarioPrepared,rocketPrepared;

        static SniperRidgeAutoPlay()
        {
            EditorApplication.update += Tick;
        }

        static string Phase
        {
            get => SessionState.GetString(PhaseKey, "");
            set => SessionState.SetString(PhaseKey, value);
        }

        static void Tick()
        {
            double now = EditorApplication.timeSinceStartup;
            string phase = Phase;

            if (phase == "")
            {
                if (now - lastPoll < 1.0) return;
                lastPoll = now;
                if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling) return;
                if (!File.Exists(RequestPath)) return;
                Phase = "enter";
                File.Delete(ResultPath);
                Debug.Log("[Sniper Ridge AutoPlay] 요청 파일을 찾아 Play 를 시작합니다.");
                EditorApplication.EnterPlaymode();
                return;
            }

            if (!EditorApplication.isPlaying)
            {
                // Play 진입 대기 중이거나, Play 가 밖에서 꺼졌다.
                if (phase != "enter") { Finish("Play 가 예기치 않게 종료됨"); }
                return;
            }

            if (request == null)
            {
                request = Parse(RequestPath);
                if (request == null) { Finish("요청 파일 없음"); return; }
                if (!logHooked) { Application.logMessageReceived += OnLog; logHooked = true; }
                phaseStart = now; step = 0;
            }

            try { Run(now); }
            catch (Exception ex) { errors.Add("AutoPlay 예외: " + ex); Finish("예외"); }
        }

        static void Run(double now)
        {
            string phase = Phase;
            if (phase == "enter")
            {
                var menu = UnityEngine.Object.FindObjectOfType<TacticalStartMenu>();
                var gm = UnityEngine.Object.FindObjectOfType<GameManager>();
                if (menu == null || gm == null || !gm.IsSelecting)
                {
                    if (now - phaseStart > 60) Finish("시작 메뉴를 60초 안에 찾지 못함");
                    return;
                }
                if (now - phaseStart < 1.0) return; // 메뉴가 열린 프레임의 Enter 무시 로직을 피한다
                int mode = Int("mode", 9);
                menu.Select(mode);
                var deploy = typeof(TacticalStartMenu).GetMethod("Deploy", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
                deploy.Invoke(menu, null);
                results.Add("출전: 모드 " + mode + " (" + WeaponDefinition.All[mode].Name + ")");
                Phase = "deployed"; phaseStart = now; step = 0;
                return;
            }

            if (phase == "deployed")
            {
                var gm = UnityEngine.Object.FindObjectOfType<GameManager>();
                if(!scenarioPrepared&&Int("heli_clear",0)==1&&now-phaseStart>1.5)
                {
                    int cleared=0;
                    foreach(var enemy in UnityEngine.Object.FindObjectsOfType<EnemySoldier>())
                        if(enemy!=null&&!enemy.IsDead&&enemy.name.StartsWith("Rooftop_1_Guard_"))
                        {enemy.Kill(false,Vector3.forward);gm.OnEnemyHit(enemy,false,0,true,false);cleared++;}
                    results.Add("첫 옥상 경계병 제거: "+cleared);scenarioPrepared=true;
                }
                if(!rocketPrepared&&Int("heli_rocket",0)==1&&now-phaseStart>Mathf.Max(2,Int("wait",8)-1))
                {
                    foreach(var enemy in UnityEngine.Object.FindObjectsOfType<EnemySoldier>())
                        if(enemy!=null&&!enemy.IsDead&&enemy.Role==EnemyRole.RocketTrooper)
                        {InfantryRocket.Launch(enemy,enemy.Muzzle,gm.Player.AimPoint);results.Add("검증용 적 로켓 발사");break;}
                    rocketPrepared=true;
                }
                if (step == 0)
                {
                    if (gm != null && gm.IsSelecting && now - phaseStart > 3)
                    { Finish("출전이 거부됨 (에셋 미생성 등). 시작 메뉴 설명 문구와 Console 을 확인"); return; }
                    if (now - phaseStart < Int("wait", 8)) return;
                    step = 1; phaseStart = now;
                    if(Int("heli_clear",0)==1&&gm!=null&&gm.Flight!=null&&gm.Rescue!=null)
                        results.Add("옥상 구조 상태: 착륙="+gm.Flight.IsOnPad+", 접근="+gm.Flight.IsApproachingPad+
                            ", 탑승="+Mathf.RoundToInt(gm.Rescue.BoardingProgress*100f)+"%, 고도="+gm.Flight.Altitude.ToString("0.0")+"m");
                    if(Int("heli_rocket",0)==1)results.Add("화면 내 적 로켓: "+UnityEngine.Object.FindObjectsOfType<InfantryRocket>().Length);
                    if (Int("explosion", 0) == 1)
                    {
                        var cam = Camera.main;
                        if (cam != null)
                        {
                            var p = cam.transform.position + cam.transform.forward * 15f;
                            if (Physics.Raycast(p + Vector3.up * 30f, Vector3.down, out var hit, 80f)) p = hit.point;
                            CombatVfx.Explosion(p, 1.4f);
                            results.Add("폭발 효과 생성: " + p);
                        }
                    }
                    return;
                }
                if (step == 1)
                {
                    if (now - phaseStart < 0.35) return; // 폭발이 화염구 단계일 때
                    Shot("on");
                    SetBypass(true);
                    step = 2; phaseStart = now;
                    return;
                }
                if (step == 2)
                {
                    if (now - phaseStart < 0.6) return;
                    Shot("off");
                    SetBypass(false);
                    step = 3; phaseStart = now;
                    return;
                }
                if (step == 3)
                {
                    if (now - phaseStart < 1.0) return; // 스크린샷 파일이 써질 시간
                    Finish("완료");
                }
            }
        }

        static void Shot(string suffix)
        {
            string dir = Path.GetFullPath(Path.Combine(Application.dataPath, "../Screenshots"));
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, "auto_" + Get("tag", "shot") + "_" + suffix + ".png");
            if (File.Exists(file)) File.Delete(file);
            ScreenCapture.CaptureScreenshot(file, Mathf.Clamp(Int("supersize", 2), 1, 4));
            results.Add("스크린샷: " + file);
        }

        static void SetBypass(bool value)
        {
            var post = UnityEngine.Object.FindObjectOfType<PostEffect>();
            if (post == null) { results.Add("PostEffect 없음"); return; }
            var f = typeof(PostEffect).GetField("bypass", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            f?.SetValue(post, value);
        }

        static void Finish(string why)
        {
            results.Add("종료: " + why);
            try
            {
                Directory.CreateDirectory("Logs");
                var lines = new List<string>();
                lines.Add("time=" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                lines.Add("status=" + why);
                lines.AddRange(results);
                lines.Add("errors=" + errors.Count);
                lines.AddRange(errors);
                File.WriteAllLines(ResultPath, lines);
                if (File.Exists(RequestPath)) File.Delete(RequestPath);
            }
            catch (Exception ex) { Debug.LogWarning("[Sniper Ridge AutoPlay] 결과 저장 실패: " + ex.Message); }
            Debug.Log("[Sniper Ridge AutoPlay] " + why);
            bool quit = request == null || Int("quit", 1) == 1;
            Phase = ""; request = null; step = 0;scenarioPrepared=false;rocketPrepared=false;
            if (logHooked) { Application.logMessageReceived -= OnLog; logHooked = false; }
            if (quit && EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
        }

        static void OnLog(string condition, string stackTrace, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
            {
                string first = stackTrace ?? "";
                int nl = first.IndexOf('\n');
                if (nl > 0) first = first.Substring(0, nl);
                errors.Add(type + ": " + condition + " | " + first);
            }
        }

        static Dictionary<string, string> Parse(string path)
        {
            if (!File.Exists(path)) return null;
            var d = new Dictionary<string, string>();
            foreach (var raw in File.ReadAllLines(path))
            {
                var line = raw.Trim();
                int eq = line.IndexOf('=');
                if (eq <= 0 || line.StartsWith("#")) continue;
                d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }
            return d;
        }

        static string Get(string key, string fallback) => request != null && request.TryGetValue(key, out var v) && v != "" ? v : fallback;
        static int Int(string key, int fallback) => int.TryParse(Get(key, fallback.ToString()), out var v) ? v : fallback;
    }
}
