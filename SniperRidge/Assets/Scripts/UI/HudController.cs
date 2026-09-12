using UnityEngine;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>화면 표시: 무기 선택, 조준경, 십자선, 탄약, 체력, 호흡, 바람, 영점, 거리, 웨이브, 킬 피드, 결과 화면.</summary>
    public class HudController : MonoBehaviour
    {
        public Canvas RootCanvas { get; private set; }

        GameManager gm;
        RectTransform canvasRect;

        Text enemyText, scoreText, timeText, windText, zeroText, rangeText, ammoText, stateText, weaponText, killFeed, introText, announceText, hintText, endTitle, endStats;
        RectTransform windArrow, hpFill, breathFill, hitMarker, scopeImage, barLeft, barRight, barTop, barBottom;
        Image damageFlash;
        Texture2D damageMask;Sprite damageSprite;
        Text launcherHelp, coverText, threatText, shotFeedback, launcherLabel, grenadeCount, grenadeAim;
        Button launcherButton;
        float shotFeedbackTimer;
        float threatUntil;
        Vector3 threatSource;
        string threatRole = "적";

        public void ShowShotFeedback(string message)
        {
            shotFeedback.text = message;
            shotFeedbackTimer = 2f;
            var color = shotFeedback.color; color.a = 1f; shotFeedback.color = color;
        }

        public void WarnIncoming(Vector3 source, float duration, string role = "적")
        {
            if(gm!=null && gm.Music!=null)gm.Music.Duck(Mathf.Clamp(duration,.65f,2f));
            threatSource = source;
            threatRole = role;
            threatUntil = Mathf.Max(threatUntil, Time.time + duration);
        }
        Image[] hitLines;
        GameObject scopeRoot, crosshair, endPanel, selectPanel, gameplayRoot;

        float hitTimer, killFeedTimer, introTimer, announceTimer, damageTimer;

        public static HudController Build(GameManager gm)
        {
            var go = new GameObject("HUD");
            var hud = go.AddComponent<HudController>();
            hud.gm = gm;
            hud.Construct();
            return hud;
        }

        void Construct()
        {
            var canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.transform.SetParent(transform, false);
            RootCanvas = canvasGo.GetComponent<Canvas>();
            RootCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;
            canvasRect = canvasGo.GetComponent<RectTransform>();
            Transform root = canvasGo.transform;

            var white = Color.white;
            var dim = new Color(0.85f, 0.85f, 0.85f);
            var topLeft = new Vector2(0f, 1f);
            var topRight = new Vector2(1f, 1f);
            var bottomLeft = new Vector2(0f, 0f);
            var bottomRight = new Vector2(1f, 0f);
            var center = new Vector2(0.5f, 0.5f);

            // ===== 게임플레이 HUD (임무 시작 후 표시) =====
            gameplayRoot = new GameObject("Gameplay", typeof(RectTransform));
            gameplayRoot.transform.SetParent(root, false);
            UiKit.Place(gameplayRoot.GetComponent<RectTransform>(), Vector2.zero, Vector2.one, center, Vector2.zero, Vector2.zero);
            Transform g = gameplayRoot.transform;

            // 조준경
            scopeRoot = new GameObject("Scope", typeof(RectTransform));
            scopeRoot.transform.SetParent(g, false);
            UiKit.Place(scopeRoot.GetComponent<RectTransform>(), Vector2.zero, Vector2.one, center, Vector2.zero, Vector2.zero);
            var scopeSprite = ProceduralAssets.SpriteFrom(ProceduralAssets.ScopeOverlay(1024));
            scopeImage = UiKit.Panel(scopeRoot.transform, "Reticle", white, center, center, center, Vector2.zero, new Vector2(1080f, 1080f));
            scopeImage.GetComponent<Image>().sprite = scopeSprite;
            barLeft = UiKit.Panel(scopeRoot.transform, "BarL", Color.black, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, Vector2.zero);
            barRight = UiKit.Panel(scopeRoot.transform, "BarR", Color.black, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), Vector2.zero, Vector2.zero);
            barTop = UiKit.Panel(scopeRoot.transform, "BarT", Color.black, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, Vector2.zero);
            barBottom = UiKit.Panel(scopeRoot.transform, "BarB", Color.black, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), Vector2.zero, Vector2.zero);
            scopeRoot.SetActive(false);

            // 십자선
            crosshair = new GameObject("Crosshair", typeof(RectTransform));
            crosshair.transform.SetParent(g, false);
            UiKit.Place(crosshair.GetComponent<RectTransform>(), center, center, center, Vector2.zero, Vector2.zero);
            var chColor = new Color(1f, 1f, 1f, 0.8f);
            UiKit.Panel(crosshair.transform, "Dot", chColor, center, center, center, Vector2.zero, new Vector2(4f, 4f));
            UiKit.Panel(crosshair.transform, "L", chColor, center, center, center, new Vector2(-14f, 0f), new Vector2(12f, 2f));
            UiKit.Panel(crosshair.transform, "R", chColor, center, center, center, new Vector2(14f, 0f), new Vector2(12f, 2f));
            UiKit.Panel(crosshair.transform, "U", chColor, center, center, center, new Vector2(0f, 14f), new Vector2(2f, 12f));
            UiKit.Panel(crosshair.transform, "D", chColor, center, center, center, new Vector2(0f, -14f), new Vector2(2f, 12f));

            // 피격 표시 (X)
            var hm = new GameObject("HitMarker", typeof(RectTransform));
            hm.transform.SetParent(g, false);
            hitMarker = hm.GetComponent<RectTransform>();
            UiKit.Place(hitMarker, center, center, center, Vector2.zero, Vector2.zero);
            var l1 = UiKit.Panel(hm.transform, "X1", white, center, center, center, Vector2.zero, new Vector2(44f, 3f));
            var l2 = UiKit.Panel(hm.transform, "X2", white, center, center, center, Vector2.zero, new Vector2(44f, 3f));
            l1.localRotation = Quaternion.Euler(0f, 0f, 45f);
            l2.localRotation = Quaternion.Euler(0f, 0f, -45f);
            hitLines = new[] { l1.GetComponent<Image>(), l2.GetComponent<Image>() };
            hm.SetActive(false);

            damageFlash = UiKit.Fullscreen(g, "DamageFlash", new Color(0.8f, 0f, 0f, 0f)).GetComponent<Image>();
            damageMask=new Texture2D(128,128,TextureFormat.RGBA32,false){name="Soft damage edges",wrapMode=TextureWrapMode.Clamp};
            var edgePixels=new Color[128*128];
            for(int y=0;y<128;y++)for(int x=0;x<128;x++)
            {
                float edge=Mathf.Max(Mathf.Abs((x+.5f)/128f*2-1),Mathf.Abs((y+.5f)/128f*2-1));
                edgePixels[y*128+x]=new Color(1,1,1,Mathf.SmoothStep(0,1,Mathf.InverseLerp(.62f,1f,edge)));
            }
            damageMask.SetPixels(edgePixels);damageMask.Apply();
            damageSprite=Sprite.Create(damageMask,new Rect(0,0,128,128),Vector2.one*.5f);damageFlash.sprite=damageSprite;

            coverText = UiKit.Label(g, "CoverState", "", 24, TextAnchor.MiddleCenter, white,
                new Vector2(.5f, 0f), new Vector2(.5f, 0f), new Vector2(0f, 90f), new Vector2(1000f, 80f), true);
            threatText = UiKit.Label(g, "IncomingFire", "", 30, TextAnchor.MiddleCenter, new Color(1f, .55f, .2f),
                new Vector2(.5f, 1f), new Vector2(.5f, 1f), new Vector2(0f, -195f), new Vector2(1000f, 45f), true);

            shotFeedback = UiKit.Label(g, "ShotFeedback", "", 22, TextAnchor.MiddleCenter, new Color(1f, .8f, .45f),
                center, center, new Vector2(0f, -205f), new Vector2(850f, 35f));

            // 좌상단
            enemyText = UiKit.Label(g, "Enemies", "", 30, TextAnchor.UpperLeft, white, topLeft, topLeft, new Vector2(30f, -25f), new Vector2(800f, 40f), true);
            scoreText = UiKit.Label(g, "Score", "", 26, TextAnchor.UpperLeft, dim, topLeft, topLeft, new Vector2(30f, -66f), new Vector2(700f, 34f));
            timeText = UiKit.Label(g, "Time", "", 24, TextAnchor.UpperLeft, dim, topLeft, topLeft, new Vector2(30f, -100f), new Vector2(700f, 32f));

            // 우상단
            windText = UiKit.Label(g, "Wind", "", 26, TextAnchor.UpperRight, white, topRight, topRight, new Vector2(-30f, -25f), new Vector2(700f, 36f), true);
            var arrowGo = UiKit.Panel(g, "WindArrow", white, topRight, topRight, center, new Vector2(-62f, -92f), new Vector2(54f, 54f));
            arrowGo.GetComponent<Image>().sprite = ProceduralAssets.SpriteFrom(ProceduralAssets.ArrowTexture(64));
            windArrow = arrowGo;
            zeroText = UiKit.Label(g, "Zero", "", 24, TextAnchor.UpperRight, dim, topRight, topRight, new Vector2(-30f, -132f), new Vector2(700f, 32f));

            rangeText = UiKit.Label(g, "Range", "", 30, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, -150f), new Vector2(300f, 40f), true);

            // 좌하단
            UiKit.Label(g, "HpLabel", "체력", 20, TextAnchor.LowerLeft, dim, bottomLeft, bottomLeft, new Vector2(30f, 56f), new Vector2(200f, 26f));
            var hpBg = UiKit.Panel(g, "HpBg", new Color(0f, 0f, 0f, 0.55f), bottomLeft, bottomLeft, bottomLeft, new Vector2(30f, 30f), new Vector2(320f, 22f));
            hpFill = UiKit.Panel(hpBg, "HpFill", new Color(0.85f, 0.2f, 0.2f), new Vector2(0f, 0f), new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(316f, -4f));
            UiKit.Label(g, "BreathLabel", "호흡", 20, TextAnchor.LowerLeft, dim, bottomLeft, bottomLeft, new Vector2(30f, 108f), new Vector2(200f, 26f));
            var brBg = UiKit.Panel(g, "BreathBg", new Color(0f, 0f, 0f, 0.55f), bottomLeft, bottomLeft, bottomLeft, new Vector2(30f, 86f), new Vector2(320f, 18f));
            breathFill = UiKit.Panel(brBg, "BreathFill", new Color(0.3f, 0.7f, 1f), new Vector2(0f, 0f), new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(316f, -4f));

            // 우하단
            ammoText = UiKit.Label(g, "Ammo", "", 46, TextAnchor.LowerRight, white, bottomRight, bottomRight, new Vector2(-30f, 36f), new Vector2(400f, 60f), true);
            stateText = UiKit.Label(g, "WeaponState", "", 24, TextAnchor.LowerRight, dim, bottomRight, bottomRight, new Vector2(-30f, 100f), new Vector2(400f, 34f));
            weaponText = UiKit.Label(g, "WeaponName", "", 22, TextAnchor.LowerRight, dim, bottomRight, bottomRight, new Vector2(-30f, 134f), new Vector2(400f, 30f));

            launcherButton = UiKit.TextButton(g, "SwitchLauncher", "", 23,
                new Color(.19f, .24f, .12f, .92f), Color.white, topRight, topRight,
                new Vector2(-30f, -220f), new Vector2(300f, 65f), () => gm.Player.ToggleLauncher());
            launcherLabel = launcherButton.GetComponentInChildren<Text>();
            var nav = launcherButton.navigation; nav.mode = Navigation.Mode.None; launcherButton.navigation = nav;
            launcherHelp = UiKit.Label(g, "LauncherHelp", Application.isMobilePlatform ? "로켓은 발사 즉시 위치 발각" : "Q: 즉시 교체 · Esc: 버튼 클릭",
                18, TextAnchor.UpperRight, dim, topRight, topRight, new Vector2(-30f, -291f), new Vector2(350f, 30f));

            grenadeCount = UiKit.Label(g, "GrenadeCount", "", 24, TextAnchor.UpperRight, white,
                topRight, topRight, new Vector2(-30f, -337f), new Vector2(410f, 35f), true);
            grenadeAim = UiKit.Label(g, "GrenadeAim", "", 25, TextAnchor.MiddleCenter, new Color(.55f, 1f, .65f),
                center, center, new Vector2(0f, -270f), new Vector2(1200f, 80f), true);

            // 킬 피드 / 안내
            killFeed = UiKit.Label(g, "KillFeed", "", 34, TextAnchor.MiddleCenter, new Color(1f, 0.9f, 0.4f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(1000f, 50f), true);
            announceText = UiKit.Label(g, "Announce", "", 44, TextAnchor.MiddleCenter, new Color(1f, 0.6f, 0.3f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -110f), new Vector2(1200f, 60f), true);
            introText = UiKit.Label(g, "Intro", "", 30, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, 230f), new Vector2(1300f, 180f));
            hintText = UiKit.Label(g, "Hint",
                "W 누르기: 수류탄 조준 / 놓기: 투척  |  Q 로켓포  |  C/Ctrl 엄폐  |  A/D 이동  |  우클릭 조준  |  R 재장전  |  휠 배율",
                20, TextAnchor.LowerCenter, new Color(1f, 1f, 1f, 0.6f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 10f), new Vector2(1700f, 30f));
            if (Application.isMobilePlatform) hintText.gameObject.SetActive(false);
            FlagObjectiveHud.Create(g,canvasRect,gm);
            gameplayRoot.SetActive(false);

            // ===== 무기 선택 화면 =====
            BuildSelectPanel(root);

            // ===== 결과 화면 =====
            var panel = UiKit.Fullscreen(root, "EndPanel", new Color(0f, 0f, 0f, 0.72f));
            panel.GetComponent<Image>().raycastTarget = true;
            endPanel = panel.gameObject;
            endTitle = UiKit.Label(panel, "Title", "", 76, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, 150f), new Vector2(1200f, 100f), true);
            endStats = UiKit.Label(panel, "Stats", "", 30, TextAnchor.MiddleCenter, dim, center, center, new Vector2(0f, -10f), new Vector2(1200f, 200f));
            UiKit.TextButton(panel, "Restart", "무기 선택으로", 32, new Color(0.9f, 0.9f, 0.9f, 0.95f), Color.black,
                             center, center, new Vector2(0f, -200f), new Vector2(360f, 84f), () => gm.Restart());
            endPanel.SetActive(false);
        }

        void BuildSelectPanel(Transform root)
        {
            selectPanel = TacticalStartMenu.Build(root, gm);
        }

        // ---------- 외부 호출 ----------

        public void OnMissionStart(string intro)
        {
            selectPanel.SetActive(false);
            gameplayRoot.SetActive(true);
            introText.text = intro;
            introTimer = 8f;
            var c = introText.color; c.a = 1f; introText.color = c;
        }

        public void ShowHitMarker(bool headshot, bool killed)
        {
            ShowShotFeedback(killed ? "처치 확인" : "명중 · 적 생존");
            hitTimer = killed ? 0.3f : 0.15f;
            Color c = killed ? (headshot ? new Color(1f, 0.25f, 0.2f) : Color.white) : new Color(1f, 1f, 1f, 0.6f);
            foreach (var img in hitLines) img.color = c;
            hitMarker.localScale = Vector3.one * (killed ? 1f : 0.7f);
            hitMarker.gameObject.SetActive(true);
        }

        public void KillFeed(string text)
        {
            killFeed.text = text;
            killFeedTimer = 2.5f;
        }

        public void Announce(string text)
        {
            announceText.text = text;
            announceTimer = 4f;
        }

        public void FlashDamage()
        {
            damageTimer = 0.6f;
        }

        public void ShowEnd(bool won)
        {
            endPanel.SetActive(true);
            endTitle.text = won ? "임무 완료" : gm.Mission == MissionType.Tank ? "전차 파괴" : "전사";
            endTitle.color = won ? new Color(0.6f, 1f, 0.6f) : new Color(1f, 0.45f, 0.4f);
            int m = Mathf.FloorToInt(gm.Elapsed / 60f);
            int s = Mathf.FloorToInt(gm.Elapsed % 60f);
            float acc = gm.Shots > 0 ? Mathf.Min(100f, 100f * gm.Hits / gm.Shots) : 0f;
            string waveLine = gm.Mission == MissionType.Assault ? (gm.Assault.Progress.Complete?"왕 처치 완료\n":"왕 처치 작전\n") : gm.Mission == MissionType.Tank ? string.Format("전차전 단계 {0} / 5\n",gm.Armor.Stage) : gm.Mission == MissionType.Defense ? string.Format("웨이브  {0} / {1}\n", gm.Wave, gm.TotalWaves) : "";
            endStats.text = string.Format(
                "{0}\n{1}소요 시간  {2:00}:{3:00}\n사격 {4}발  /  명중 {5}발  (명중률 {6:0}%)\n사살 {7}  (헤드샷 {8})\n점수  {9}\n\n{10}",
                gm.Weapon != null ? gm.Weapon.Name : "", waveLine, m, s, gm.Shots, gm.Hits, acc, gm.Kills, gm.Headshots, gm.Score,
                Application.isMobilePlatform ? "" : "Enter 키로 무기 선택 화면");
        }

        // ---------- 갱신 ----------

        void Update()
        {
            if (gm == null || gm.Player == null) return;
            if (gm.IsSelecting) return;
            var p = gm.Player;
            launcherButton.gameObject.SetActive(!p.IsMounted && !p.InTank && !p.IsFreeRoam);
            launcherHelp.gameObject.SetActive(!p.IsMounted && !p.InTank && !p.IsFreeRoam);
            windArrow.gameObject.SetActive(!p.IsFreeRoam);
            grenadeCount.gameObject.SetActive(!p.IsMounted && !p.InTank);
            if (p.IsMounted) hintText.text = "마우스 조준  |  좌클릭 연사  |  우클릭 확대  |  R 탄띠 교체  |  휠/Z 배율  |  헬기 자동 선회";
            grenadeCount.text = string.Format(p.IsFreeRoam?"[G] 수류탄 {0}개 · 누르고 조준":"[W] 수류탄 {0}개 · 누르고 조준", p.Grenades.Count);
            grenadeAim.text = p.Grenades.IsAiming ? p.Grenades.AimLabel : "";
            grenadeAim.color = p.Grenades.ValidTarget ? new Color(.55f, 1f, .65f) : new Color(1f, .55f, .3f);
            launcherButton.interactable = gm.IsPlaying && p.CanSwitchWeapon;
            launcherLabel.text = p.UsingLauncher ? "[Q] 원래 총으로 복귀" : string.Format("[Q] 로켓포 · {0}발", p.RocketsRemaining);
            string posture = p.IsHidden ? "엄폐 중 · 키를 놓으면 일어섭니다" :
                p.CanFireFromCover ? "노출 중 · C/Ctrl로 숨기 / A·D로 피하기" : "자세 전환 중";
            string contact = gm.Mission == MissionType.Sniper
                ? (!gm.PositionRevealed ? "은폐 유지" : p.IsHidden
                    ? string.Format("추적 해제까지 {0:0.0}초", (1f - gm.HideProgress) * CounterfireRules.LoseContactSeconds)
                    : "위치 발각 · 적 반격 중")
                : "적이 사격하며 접근합니다 · 엄폐 후 반격";
            coverText.text = p.IsMounted
                ? string.Format("헬기 선회 중 · 고도 {0:0}m / 속도 {1:0}km/h\n거치식 중기관총 · 지상과 옥상의 적을 공격하세요", gm.Flight.Altitude, gm.Flight.Velocity.magnitude * 3.6f)
                : posture + "\n" + contact;
            coverText.color = p.IsHidden ? new Color(.55f, 1f, .7f) : new Color(1f, .8f, .45f);
            if (gm.IsPlaying && Time.time < threatUntil)
            {
                Vector3 direction = p.transform.InverseTransformPoint(threatSource);
                string side = direction.z < 0f ? "후방" : Mathf.Abs(direction.x) < Mathf.Abs(direction.z) * .25f ? "정면" : direction.x < 0f ? "← 좌측" : "우측 →";
                threatText.text = threatRole + " 조준 / 탄 접근  " + side + (p.IsMounted ? "  ·  적 반격" : "  ·  C/Ctrl 엄폐");
            }
            else threatText.text = "";
            float dt = Time.deltaTime;

            if (gm.Mission != MissionType.Defense)
            {
                enemyText.text = string.Format("적 잔여  {0} / {1}", gm.TotalEnemies - gm.Kills, gm.TotalEnemies);
            }
            else
            {
                enemyText.text = gm.Wave == 0
                    ? "웨이브 준비 중..."
                    : string.Format("웨이브 {0} / {1}    남은 적 {2}{3}", gm.Wave, gm.TotalWaves, gm.AliveEnemies, gm.WaveSpawning ? " (증원 중)" : "");
            }
            scoreText.text = string.Format("점수  {0}    사살 {1}", gm.Score, gm.Kills);
            timeText.text = string.Format("시간  {0:00}:{1:00}", Mathf.FloorToInt(gm.Elapsed / 60f), Mathf.FloorToInt(gm.Elapsed % 60f));

            Vector3 w = gm.Wind.Wind;
            Vector3 local = p.transform.InverseTransformDirection(w);
            float cross = local.x;
            windText.text = string.Format("바람  {0:0.0} m/s   횡풍 {1}{2:0.0}", w.magnitude, cross >= 0f ? "→ " : "← ", Mathf.Abs(cross));
            windArrow.localRotation = Quaternion.Euler(0f, 0f, -Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg);
            zeroText.text = p.Weapon != null && p.Weapon.HasZeroing
                ? string.Format("영점 {0} m   배율 {1}", p.ZeroRange, p.ZoomLabel)
                : string.Format("배율 {0}", p.ZoomLabel);

            rangeText.text = p.RangeMeters > 0f ? string.Format("{0:0} m", p.RangeMeters) : "---";
            ammoText.text = string.Format("{0} / {1}", p.AmmoInMag, p.Reserve);
            stateText.text = p.StateLabel;
            weaponText.text = p.Weapon != null ? p.Weapon.Name : "";

            hpFill.localScale = new Vector3(Mathf.Clamp01(gm.Health.Fraction), 1f, 1f);
            breathFill.localScale = new Vector3(Mathf.Clamp01(p.Breath), 1f, 1f);

            bool scoped = p.IsScoped && p.CurrentScopeFov < 20f;   // 저배율 광학(2x 등)은 오버레이 없이 총 모델로 조준
            if (scopeRoot.activeSelf != scoped) scopeRoot.SetActive(scoped);
            bool showCross = !scoped;
            if (crosshair.activeSelf != showCross) crosshair.SetActive(showCross);
            if (scoped) LayoutScope();

            if (hitTimer > 0f)
            {
                hitTimer -= dt;
                if (hitTimer <= 0f) hitMarker.gameObject.SetActive(false);
            }
            if(p.IsFreeRoam && gm.Assault!=null)
            {
                var battle=gm.Assault;
                enemyText.fontSize=24;rangeText.fontSize=24;rangeText.rectTransform.sizeDelta=new Vector2(420,40);
                if(p.Weapon.IsAssault)weaponText.text="돌격소총";
                enemyText.text="왕 처치 작전 · 북부 요새로 진격";
                rangeText.text="";
                coverText.text="적 처치 시 예비 탄약 자동 확보\n"+battle.SquadStatus;
                coverText.color=new Color(.85f,.85f,.75f);
                zeroText.text=p.FreeMovement.Crouching?"앉은 자세":p.FreeMovement.Sprinting?"달리는 중":"이동/교전";
                windText.text="목표: "+battle.ObjectiveName;windText.fontSize=20;zeroText.text="[Tab] 지도 · 왕 표식으로 전진";
                breathFill.localScale=new Vector3(p.FreeMovement.Stamina,1,1);
                threatText.fontSize=20;threatText.rectTransform.anchoredPosition=new Vector2(0,-154);
                killFeed.fontSize=22;killFeed.rectTransform.anchoredPosition=new Vector2(0,-188);
                announceText.fontSize=27;announceText.rectTransform.anchoredPosition=new Vector2(0,-222);
                if(Time.time<threatUntil)threatText.text="적 사격 · 이동하거나 장애물 뒤로 피하세요";
                coverText.fontSize=20;
                grenadeCount.fontSize=20;grenadeCount.rectTransform.anchoredPosition=new Vector2(-30,-100);
                hintText.text="WASD 이동 · Tab 지도 | 1 소총 · 2 기관총 · 3 저격 · 4 로켓 | R 장전 · G 수류탄";
                if(Cursor.lockState!=CursorLockMode.Locked)hintText.text="게임 화면을 클릭해 조작을 시작하세요";
            }
            if (p.InTank && gm.Armor != null)
            {
                var tank = gm.Armor.PlayerTank;
                enemyText.text = string.Format("전차전 {0}/5 · 적 전차 {1} · 로켓병 {2}",gm.Armor.Stage,gm.Armor.AliveTanks,gm.Armor.AliveRockets);
                coverText.text = string.Format("속도 {0:0} km/h · 장갑 {1:0}%\n바위로 로켓 사선을 막고 포격하세요.",tank.Speed*3.6f,tank.Fraction*100f);
                hpFill.localScale = new Vector3(tank.Fraction,1,1);
                ammoText.text = "포탄 " + tank.Shells;
                stateText.text = tank.ReloadRemaining>0 ? string.Format("재장전 {0:0.0}초",tank.ReloadRemaining) : tank.HasAim ? "포격 준비" : "포탑 정렬 중";
                weaponText.text = "전차 주포";zeroText.text = "마우스 포탑 조준";
                rangeText.text = "";grenadeAim.text = "";windText.text = gm.Armor.Resupplying ? "정비 · 재보급" : "W/S 전후진 · A/D 차체 회전";
                hintText.text = Cursor.lockState != CursorLockMode.Locked
                    ? "게임 화면을 클릭하거나 W/A/S/D를 눌러 전차 조작을 시작하세요"
                    : "W 전진  |  S 후진  |  A/D 차체 회전  |  마우스 포탑 조준  |  좌클릭 포격  |  우클릭 확대  |  Esc 커서 해제";
                if (Time.time < threatUntil) threatText.text = threatRole + " 공격 준비 · 이동하거나 바위 뒤로 피하세요";
            }
            Fade(shotFeedback, ref shotFeedbackTimer, dt, .6f);
            Fade(killFeed, ref killFeedTimer, dt, 0.6f);
            Fade(announceText, ref announceTimer, dt, 1.0f);
            Fade(introText, ref introTimer, dt, 1.5f);
            if (damageTimer > 0f)
            {
                damageTimer -= dt;
                var c = damageFlash.color;
                c.a = Mathf.Clamp01(damageTimer / 0.6f) * 0.45f;
                damageFlash.color = c;
            }
        }

        static void Fade(Text t, ref float timer, float dt, float fadeLen)
        {
            if (timer <= 0f) return;
            timer -= dt;
            var c = t.color;
            c.a = Mathf.Clamp01(timer / fadeLen);
            t.color = c;
        }
        void OnDestroy(){if(damageSprite!=null)Destroy(damageSprite);if(damageMask!=null)Destroy(damageMask);}

        void LayoutScope()
        {
            float w = canvasRect.rect.width;
            float h = canvasRect.rect.height;
            float side = Mathf.Min(w, h);
            scopeImage.sizeDelta = new Vector2(side, side);
            float sideBar = Mathf.Max(0f, (w - side) * 0.5f + 1f);
            float topBar = Mathf.Max(0f, (h - side) * 0.5f + 1f);
            barLeft.sizeDelta = new Vector2(sideBar, h);
            barRight.sizeDelta = new Vector2(sideBar, h);
            barTop.sizeDelta = new Vector2(w, topBar);
            barBottom.sizeDelta = new Vector2(w, topBar);
        }
    }
}
