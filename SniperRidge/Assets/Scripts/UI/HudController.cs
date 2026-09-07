using UnityEngine;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>화면 표시: 조준경, 십자선, 탄약, 체력, 호흡, 바람, 영점, 거리, 킬 피드, 결과 화면.</summary>
    public class HudController : MonoBehaviour
    {
        public Canvas RootCanvas { get; private set; }

        GameManager gm;
        RectTransform canvasRect;

        Text enemyText, scoreText, timeText, windText, zeroText, rangeText, ammoText, stateText, killFeed, introText, hintText, endTitle, endStats;
        RectTransform windArrow, hpFill, breathFill, hitMarker, scopeImage, barLeft, barRight, barTop, barBottom;
        Image damageFlash;
        Image[] hitLines;
        GameObject scopeRoot, crosshair, endPanel;

        float hitTimer, killFeedTimer, introTimer = 8f, damageTimer;

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

            // ----- 조준경 (맨 아래 레이어) -----
            scopeRoot = new GameObject("Scope", typeof(RectTransform));
            scopeRoot.transform.SetParent(root, false);
            UiKit.Place(scopeRoot.GetComponent<RectTransform>(), Vector2.zero, Vector2.one, center, Vector2.zero, Vector2.zero);
            var scopeSprite = ProceduralAssets.SpriteFrom(ProceduralAssets.ScopeOverlay(1024));
            scopeImage = UiKit.Panel(scopeRoot.transform, "Reticle", white, center, center, center, Vector2.zero, new Vector2(1080f, 1080f));
            scopeImage.GetComponent<Image>().sprite = scopeSprite;
            barLeft = UiKit.Panel(scopeRoot.transform, "BarL", Color.black, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, Vector2.zero);
            barRight = UiKit.Panel(scopeRoot.transform, "BarR", Color.black, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), Vector2.zero, Vector2.zero);
            barTop = UiKit.Panel(scopeRoot.transform, "BarT", Color.black, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, Vector2.zero);
            barBottom = UiKit.Panel(scopeRoot.transform, "BarB", Color.black, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), Vector2.zero, Vector2.zero);
            scopeRoot.SetActive(false);

            // ----- 십자선 (비조준 상태) -----
            crosshair = new GameObject("Crosshair", typeof(RectTransform));
            crosshair.transform.SetParent(root, false);
            UiKit.Place(crosshair.GetComponent<RectTransform>(), center, center, center, Vector2.zero, Vector2.zero);
            var chColor = new Color(1f, 1f, 1f, 0.8f);
            UiKit.Panel(crosshair.transform, "Dot", chColor, center, center, center, Vector2.zero, new Vector2(4f, 4f));
            UiKit.Panel(crosshair.transform, "L", chColor, center, center, center, new Vector2(-14f, 0f), new Vector2(12f, 2f));
            UiKit.Panel(crosshair.transform, "R", chColor, center, center, center, new Vector2(14f, 0f), new Vector2(12f, 2f));
            UiKit.Panel(crosshair.transform, "U", chColor, center, center, center, new Vector2(0f, 14f), new Vector2(2f, 12f));
            UiKit.Panel(crosshair.transform, "D", chColor, center, center, center, new Vector2(0f, -14f), new Vector2(2f, 12f));

            // ----- 피격 표시 (X) -----
            var hm = new GameObject("HitMarker", typeof(RectTransform));
            hm.transform.SetParent(root, false);
            hitMarker = hm.GetComponent<RectTransform>();
            UiKit.Place(hitMarker, center, center, center, Vector2.zero, Vector2.zero);
            var l1 = UiKit.Panel(hm.transform, "X1", white, center, center, center, Vector2.zero, new Vector2(44f, 3f));
            var l2 = UiKit.Panel(hm.transform, "X2", white, center, center, center, Vector2.zero, new Vector2(44f, 3f));
            l1.localRotation = Quaternion.Euler(0f, 0f, 45f);
            l2.localRotation = Quaternion.Euler(0f, 0f, -45f);
            hitLines = new[] { l1.GetComponent<Image>(), l2.GetComponent<Image>() };
            hm.SetActive(false);

            // ----- 피해 플래시 -----
            damageFlash = UiKit.Fullscreen(root, "DamageFlash", new Color(0.8f, 0f, 0f, 0f)).GetComponent<Image>();

            // ----- 좌상단: 임무 상태 -----
            enemyText = UiKit.Label(root, "Enemies", "", 30, TextAnchor.UpperLeft, white, topLeft, topLeft, new Vector2(30f, -25f), new Vector2(700f, 40f), true);
            scoreText = UiKit.Label(root, "Score", "", 26, TextAnchor.UpperLeft, dim, topLeft, topLeft, new Vector2(30f, -66f), new Vector2(700f, 34f));
            timeText = UiKit.Label(root, "Time", "", 24, TextAnchor.UpperLeft, dim, topLeft, topLeft, new Vector2(30f, -100f), new Vector2(700f, 32f));

            // ----- 우상단: 바람 / 영점 -----
            windText = UiKit.Label(root, "Wind", "", 26, TextAnchor.UpperRight, white, topRight, topRight, new Vector2(-30f, -25f), new Vector2(700f, 36f), true);
            var arrowGo = UiKit.Panel(root, "WindArrow", white, topRight, topRight, center, new Vector2(-62f, -92f), new Vector2(54f, 54f));
            arrowGo.GetComponent<Image>().sprite = ProceduralAssets.SpriteFrom(ProceduralAssets.ArrowTexture(64));
            windArrow = arrowGo;
            zeroText = UiKit.Label(root, "Zero", "", 24, TextAnchor.UpperRight, dim, topRight, topRight, new Vector2(-30f, -132f), new Vector2(700f, 32f));

            // ----- 중앙 하단: 거리 -----
            rangeText = UiKit.Label(root, "Range", "", 30, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, -150f), new Vector2(300f, 40f), true);

            // ----- 좌하단: 체력 / 호흡 -----
            UiKit.Label(root, "HpLabel", "체력", 20, TextAnchor.LowerLeft, dim, bottomLeft, bottomLeft, new Vector2(30f, 56f), new Vector2(200f, 26f));
            var hpBg = UiKit.Panel(root, "HpBg", new Color(0f, 0f, 0f, 0.55f), bottomLeft, bottomLeft, bottomLeft, new Vector2(30f, 30f), new Vector2(320f, 22f));
            hpFill = UiKit.Panel(hpBg, "HpFill", new Color(0.85f, 0.2f, 0.2f), new Vector2(0f, 0f), new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(316f, -4f));
            UiKit.Label(root, "BreathLabel", "호흡", 20, TextAnchor.LowerLeft, dim, bottomLeft, bottomLeft, new Vector2(30f, 108f), new Vector2(200f, 26f));
            var brBg = UiKit.Panel(root, "BreathBg", new Color(0f, 0f, 0f, 0.55f), bottomLeft, bottomLeft, bottomLeft, new Vector2(30f, 86f), new Vector2(320f, 18f));
            breathFill = UiKit.Panel(brBg, "BreathFill", new Color(0.3f, 0.7f, 1f), new Vector2(0f, 0f), new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(316f, -4f));

            // ----- 우하단: 탄약 -----
            ammoText = UiKit.Label(root, "Ammo", "", 46, TextAnchor.LowerRight, white, bottomRight, bottomRight, new Vector2(-30f, 36f), new Vector2(400f, 60f), true);
            stateText = UiKit.Label(root, "WeaponState", "", 24, TextAnchor.LowerRight, dim, bottomRight, bottomRight, new Vector2(-30f, 100f), new Vector2(400f, 34f));

            // ----- 킬 피드 / 안내 -----
            killFeed = UiKit.Label(root, "KillFeed", "", 34, TextAnchor.MiddleCenter, new Color(1f, 0.9f, 0.4f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(1000f, 50f), true);
            introText = UiKit.Label(root, "Intro",
                "능선에 잠복 중.\n맞은편 능선의 바위 뒤에 숨은 적을 모두 제거하라.\n첫 발 이후 적은 경계 태세로 전환해 반격한다.",
                30, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, 230f), new Vector2(1300f, 140f));
            hintText = UiKit.Label(root, "Hint",
                "우클릭 조준경  |  좌클릭 사격  |  Shift 숨 참기  |  R 재장전  |  휠/Z 배율  |  ↑↓ 영점  |  Esc 마우스",
                20, TextAnchor.LowerCenter, new Color(1f, 1f, 1f, 0.6f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 10f), new Vector2(1600f, 30f));
            if (Application.isMobilePlatform) hintText.gameObject.SetActive(false);

            // ----- 결과 화면 -----
            var panel = UiKit.Fullscreen(root, "EndPanel", new Color(0f, 0f, 0f, 0.72f));
            panel.GetComponent<Image>().raycastTarget = true;
            endPanel = panel.gameObject;
            endTitle = UiKit.Label(panel, "Title", "", 76, TextAnchor.MiddleCenter, white, center, center, new Vector2(0f, 130f), new Vector2(1200f, 100f), true);
            endStats = UiKit.Label(panel, "Stats", "", 30, TextAnchor.MiddleCenter, dim, center, center, new Vector2(0f, -20f), new Vector2(1200f, 180f));
            UiKit.TextButton(panel, "Restart", "다시 시작", 32, new Color(0.9f, 0.9f, 0.9f, 0.95f), Color.black,
                             center, center, new Vector2(0f, -190f), new Vector2(340f, 84f), () => gm.Restart());
            endPanel.SetActive(false);
        }

        // ---------- 외부 호출 ----------

        public void ShowHitMarker(bool headshot)
        {
            hitTimer = 0.3f;
            var c = headshot ? new Color(1f, 0.25f, 0.2f) : Color.white;
            foreach (var img in hitLines) img.color = c;
            hitMarker.gameObject.SetActive(true);
        }

        public void KillFeed(string text)
        {
            killFeed.text = text;
            killFeedTimer = 2.5f;
        }

        public void FlashDamage()
        {
            damageTimer = 0.6f;
        }

        public void ShowEnd(bool won)
        {
            endPanel.SetActive(true);
            endTitle.text = won ? "임무 완료" : "전사";
            endTitle.color = won ? new Color(0.6f, 1f, 0.6f) : new Color(1f, 0.45f, 0.4f);
            int m = Mathf.FloorToInt(gm.Elapsed / 60f);
            int s = Mathf.FloorToInt(gm.Elapsed % 60f);
            float acc = gm.Shots > 0 ? 100f * gm.Hits / gm.Shots : 0f;
            endStats.text = string.Format(
                "소요 시간  {0:00}:{1:00}\n사격 {2}발  /  명중 {3}발  (명중률 {4:0}%)\n헤드샷  {5}\n점수  {6}\n\n{7}",
                m, s, gm.Shots, gm.Hits, acc, gm.Headshots, gm.Score,
                Application.isMobilePlatform ? "" : "Enter 키로 다시 시작");
        }

        // ---------- 갱신 ----------

        void Update()
        {
            if (gm == null || gm.Player == null) return;
            var p = gm.Player;
            float dt = Time.deltaTime;

            int remaining = gm.TotalEnemies - gm.Kills;
            enemyText.text = string.Format("적 잔여  {0} / {1}", remaining, gm.TotalEnemies);
            scoreText.text = string.Format("점수  {0}", gm.Score);
            timeText.text = string.Format("시간  {0:00}:{1:00}", Mathf.FloorToInt(gm.Elapsed / 60f), Mathf.FloorToInt(gm.Elapsed % 60f));

            Vector3 w = gm.Wind.Wind;
            Vector3 local = p.transform.InverseTransformDirection(w);
            float cross = local.x;
            windText.text = string.Format("바람  {0:0.0} m/s   횡풍 {1}{2:0.0}", w.magnitude, cross >= 0f ? "→ " : "← ", Mathf.Abs(cross));
            windArrow.localRotation = Quaternion.Euler(0f, 0f, -Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg);
            zeroText.text = string.Format("영점 {0} m   배율 {1}", p.ZeroRange, p.ZoomLabel);

            rangeText.text = p.RangeMeters > 0f ? string.Format("{0:0} m", p.RangeMeters) : "---";
            ammoText.text = string.Format("{0} / {1}", p.AmmoInMag, p.Reserve);
            stateText.text = p.StateLabel;

            hpFill.localScale = new Vector3(Mathf.Clamp01(gm.Health.Fraction), 1f, 1f);
            breathFill.localScale = new Vector3(Mathf.Clamp01(p.Breath), 1f, 1f);

            bool scoped = p.IsScoped;
            if (scopeRoot.activeSelf != scoped) scopeRoot.SetActive(scoped);
            if (crosshair.activeSelf == scoped) crosshair.SetActive(!scoped);
            if (scoped) LayoutScope();

            if (hitTimer > 0f)
            {
                hitTimer -= dt;
                if (hitTimer <= 0f) hitMarker.gameObject.SetActive(false);
            }
            if (killFeedTimer > 0f)
            {
                killFeedTimer -= dt;
                var c = killFeed.color;
                c.a = Mathf.Clamp01(killFeedTimer / 0.6f);
                killFeed.color = c;
            }
            if (introTimer > 0f)
            {
                introTimer -= dt;
                var c = introText.color;
                c.a = Mathf.Clamp01(introTimer / 1.5f);
                introText.color = c;
            }
            if (damageTimer > 0f)
            {
                damageTimer -= dt;
                var c = damageFlash.color;
                c.a = Mathf.Clamp01(damageTimer / 0.6f) * 0.45f;
                damageFlash.color = c;
            }
        }

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
