using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SniperRidge
{
    /// <summary>Equipment selection, a weapon preview and a short mission briefing before deployment.</summary>
    public sealed class TacticalStartMenu : MonoBehaviour
    {
        static readonly Color Ink = new Color(.055f, .075f, .082f);
        static readonly Color Panel = new Color(.09f, .125f, .137f);
        static readonly Color Line = new Color(.19f, .25f, .26f);
        static readonly Color Paper = new Color(.95f, .94f, .89f);
        static readonly Color Muted = new Color(.62f, .69f, .68f);
        static readonly Color Sand = new Color(.86f, .73f, .47f);
        static readonly Color Green = new Color(.5f, .72f, .6f);
        static readonly Color Hostile = new Color(.87f, .49f, .36f);
        static readonly Vector2 TopLeft = new Vector2(0f, 1f);
        static Font regularFont, boldFont;
        GameManager gm;
        RectTransform content, backdrop, map;
        Button[] rows;
        Image[] selectionBars;
        Text[] rowNames, rowStates;
        Text weaponName, weaponType, magazine, reserve, reload, missionTitle, objective, range, rule, deployLabel;
        GameObject sniperMap, defenseMap, citySniperMap, cityDefenseMap;
        Button fieldButton, cityButton;
        Text mapDescription;
        BattlefieldMap selectedMap;
        MenuWeaponPreview preview;
        int selected, openedFrame;
        Vector2 lastSize;

        public static GameObject Build(Transform parent, GameManager manager)
        {
            var root = UiKit.Fullscreen(parent, "TacticalStartMenu", Ink);
            root.GetComponent<Image>().raycastTarget = true;
            var menu = root.gameObject.AddComponent<TacticalStartMenu>();
            menu.gm = manager;
            menu.backdrop = root;
            menu.Construct();
            return root.gameObject;
        }

        void Construct()
        {
            openedFrame = Time.frameCount;
            selectedMap = GameManager.LastSelectedMap;
            regularFont = Resources.Load<Font>("UI/Fonts/NanumGothic-Regular");
            boldFont = Resources.Load<Font>("UI/Fonts/NanumGothic-Bold");
            var go = new GameObject("Fitted layout", typeof(RectTransform));
            go.transform.SetParent(transform, false);
            content = go.GetComponent<RectTransform>();
            UiKit.Place(content, Vector2.one * .5f, Vector2.one * .5f, Vector2.one * .5f, Vector2.zero, new Vector2(1760f, 960f));
            Fit();
            Label(content, "Kicker", "전술 작전실   /   FIELD OPERATIONS", 20, Sand, 0, 0, 1000, 30, true);
            Label(content, "Title", "SNIPER RIDGE", 90, Paper, -4, 30, 1140, 108, true);
            Label(content, "Subtitle", "전장과 무장을 선택하고, 전선에 투입하십시오.", 25, Muted, 0, 140, 1100, 36);
            Box(content, "Ready lamp", Green, 1500, 26, 8, 8);
            Label(content, "Ready", "작전 준비", 20, Green, 1526, 12, 234, 36);
            fieldButton = Button(content, "Field map", 1264, 69, 238, 58, Panel, () => SelectMap(BattlefieldMap.Field));
            Label(fieldButton.transform, "Name", "들판", 25, Paper, 10, 0, 218, 58, true, TextAnchor.MiddleCenter);
            cityButton = Button(content, "City map", 1522, 69, 238, 58, Panel, () => SelectMap(BattlefieldMap.City));
            Label(cityButton.transform, "Name", "도시 · 옥상전", 25, Paper, 10, 0, 218, 58, true, TextAnchor.MiddleCenter);
            mapDescription = Label(content, "Map description", "", 20, Muted, 1264, 138, 496, 36);
            Box(content, "Header rule", Line, 0, 190, 1760, 1);

            Label(content, "Armory header", "01  /  무기 선택", 22, Sand, 0, 212, 400, 32, true);
            Label(content, "Equipment header", "02  /  선택한 무장", 22, Sand, 432, 212, 800, 32, true);
            Label(content, "Briefing header", "03  /  작전 브리핑", 22, Sand, 1264, 212, 496, 32, true);
            BuildRows();
            BuildEquipment();
            BuildBriefing();

            Box(content, "Footer rule", Line, 0, 856, 1760, 1);
            Label(content, "Controls", "C / Ctrl  엄폐     A / D  좌우 이동     우클릭  조준     R  재장전", 22, Paper, 0, 879, 1210, 34);
            Label(content, "Selection help", "클릭 또는 1–7: 무기 선택    ·    Enter: 작전 시작", 20, Muted, 0, 922, 1210, 30);
            var deploy = Button(content, "Deploy", 1264, 878, 496, 74, Sand, Deploy);
            deployLabel = Label(deploy.transform, "Action", "", 28, Ink, 24, 0, 448, 74, true, TextAnchor.MiddleCenter);
            Select(0);
        }

        void BuildRows()
        {
            int count = WeaponDefinition.All.Length;
            rows = new Button[count]; selectionBars = new Image[count];
            rowNames = new Text[count]; rowStates = new Text[count];
            for (int i = 0; i < count; i++)
            {
                int index = i;
                var weapon = WeaponDefinition.All[i];
                var button = Button(content, "Weapon_" + weapon.Id, 0, 260 + i * 82, 400, 72, Panel, () => Select(index));
                rows[i] = button;
                selectionBars[i] = Box(button.transform, "Selection", Sand, 0, 0, 4, 72).GetComponent<Image>();
                Label(button.transform, "Key", (i + 1).ToString("00"), 22, Muted, 20, 21, 40, 32, true);
                rowNames[i] = Label(button.transform, "Name", weapon.Name, 25, Paper, 76, 9, 304, 34, true);
                rowStates[i] = Label(button.transform, "Mission", "", 17, Muted, 77, 43, 300, 24);
            }
        }

        void BuildEquipment()
        {
            var panel = Box(content, "Equipment", Panel, 432, 260, 800, 426);
            weaponType = Label(panel, "Type", "", 18, Sand, 28, 20, 744, 28, true);
            weaponName = Label(panel, "Name", "", 38, Paper, 28, 52, 744, 56, true);
            var imageGo = new GameObject("Weapon view", typeof(RectTransform), typeof(RawImage));
            imageGo.transform.SetParent(panel, false);
            UiKit.Place(imageGo.GetComponent<RectTransform>(), TopLeft, TopLeft, TopLeft, new Vector2(24, -110), new Vector2(752, 258));
            var image = imageGo.GetComponent<RawImage>(); image.raycastTarget = false;
            preview = gameObject.AddComponent<MenuWeaponPreview>();
            preview.Initialize(image, Panel);
            Box(panel, "Stats rule", Line, 28, 359, 744, 1);
            magazine = Label(panel, "Magazine", "", 22, Paper, 28, 375, 230, 34, true);
            reserve = Label(panel, "Reserve", "", 22, Paper, 288, 375, 230, 34, true);
            reload = Label(panel, "Reload", "", 22, Paper, 548, 375, 224, 34, true);
            EquipmentCard(432, "Q", "로켓포", "주무기와 즉시 교체 · 예비 8발");
            EquipmentCard(848, "W", "수류탄", "6개 지급 · 누르고 조준, 놓아 투척");
        }

        void EquipmentCard(float x, string key, string title, string text)
        {
            var panel = Box(content, title, Panel, x, 710, 384, 114);
            Box(panel, "Key background", Line, 20, 20, 42, 38);
            Label(panel, "Key", key, 23, Sand, 20, 20, 42, 38, true, TextAnchor.MiddleCenter);
            Label(panel, "Name", title, 25, Paper, 78, 21, 278, 38, true);
            Label(panel, "Description", text, 18, Muted, 20, 73, 346, 28);
        }

        void BuildBriefing()
        {
            var panel = Box(content, "Briefing", Panel, 1264, 260, 496, 564);
            missionTitle = Label(panel, "Mission", "", 35, Paper, 28, 22, 440, 50, true);
            objective = Label(panel, "Objective", "", 23, Muted, 28, 90, 440, 78);
            map = Box(panel, "Tactical map", Ink, 28, 183, 440, 238);
            for (int x = 20; x < 440; x += 40) Box(map, "Grid column", new Color(.13f, .19f, .19f), x, 0, 1, 238);
            for (int y = 18; y < 238; y += 40) Box(map, "Grid row", new Color(.13f, .19f, .19f), 0, y, 440, 1);
            Label(map, "Gunner legend", "기관총", 16, Muted, 14, 8, 62, 28);
            for (int i = 0; i < EnemyCombatRoles.GunnerColors; i++)
                Box(map, "Gunner color", EnemyCombatRoles.Uniform(EnemyRole.MachineGunner, i), 80 + i * 18, 17, 11, 11);
            Label(map, "Sniper legend", "저격", 16, Muted, 152, 8, 44, 28);
            Box(map, "Sniper color", EnemyCombatRoles.Uniform(EnemyRole.Sniper, 0), 204, 17, 11, 11);
            Label(map, "North", "N", 18, Sand, 404, 8, 24, 28, true);
            MapLine(map, new Vector2(220, 198), new Vector2(96, 46), Line);
            MapLine(map, new Vector2(220, 198), new Vector2(344, 46), Line);
            Box(map, "Trench", Sand, 202, 200, 36, 5);
            Label(map, "Player", "아군", 15, Sand, 242, 190, 80, 28);
            sniperMap = Box(map, "Sniper positions", Color.clear, 0, 0, 440, 238).gameObject;
            foreach (var spawn in BattlefieldLayout.SniperSpawns())
            {
                Vector2 relative = spawn.Pos - BattlefieldLayout.PlayerXZ;
                var marker = Box(sniperMap.transform, "Enemy", EnemyCombatRoles.Uniform(EnemyCombatRoles.Resolve(spawn), spawn.UniformVariant),
                    216 + relative.x * 1.8f, 194 - relative.y * 1.45f, 8, 8);
                marker.localRotation = Quaternion.Euler(0, 0, 45);
            }
            defenseMap = Box(map, "Defense routes", Color.clear, 0, 0, 440, 238).gameObject;
            foreach (int slot in new[] { 3, 7 })
            {
                Vector2 relative = BattlefieldLayout.DefenseSniperSpawn(slot) - BattlefieldLayout.PlayerXZ;
                var marker = Box(defenseMap.transform, "Concealed sniper", EnemyCombatRoles.Uniform(EnemyRole.Sniper, 0),
                    216 + relative.x * 1.8f, 194 - relative.y * 1.45f, 10, 10);
                marker.localRotation = Quaternion.Euler(0, 0, 45);
            }
            for (int i = 0; i < 5; i++)
            {
                Vector2 start = new Vector2(100 + i * 60, 66 + (i % 2) * 16);
                Vector2 end = Vector2.Lerp(start, new Vector2(220, 198), .52f);
                MapLine(defenseMap.transform, start, end, Hostile);
                Box(defenseMap.transform, "Attacker", EnemyCombatRoles.Uniform(EnemyRole.MachineGunner, i % 3), start.x - 4, start.y - 4, 8, 8);
                Vector2 direction = (end - start).normalized;
                Vector2 side = new Vector2(-direction.y, direction.x);
                MapLine(defenseMap.transform, end, end - direction * 10 + side * 6, Hostile);
                MapLine(defenseMap.transform, end, end - direction * 10 - side * 6, Hostile);
            }
            citySniperMap = BuildCityMap(true);
            cityDefenseMap = BuildCityMap(false);
            range = Label(panel, "Range", "", 24, Sand, 28, 439, 440, 36, true);
            rule = Label(panel, "Rule", "", 20, Paper, 28, 492, 440, 58);
        }

        GameObject BuildCityMap(bool sniper)
        {
            var root = Box(map, sniper ? "City rooftop posts" : "City defense routes", Color.clear, 0, 0, 440, 238);
            foreach (var building in CityLayout.Data.buildings)
            {
                float forward = building.z - TerrainGenerator.PlayerSpawnZ;
                if (forward > 132f || Mathf.Abs(building.x) > 54f) continue;
                Box(root, "City block", new Color(.21f, .26f, .28f), 220 + building.x * 1.8f - 17,
                    194 - forward * 1.22f - 10, 34, 20);
            }
            for (int i = 0; i < CityLayout.Data.posts.Length; i++)
            {
                if (!sniper && i != 1 && i != 3 && i != 4 && i != 5) continue;
                var spawn = CityLayout.Spawn(i);
                Vector2 relative = spawn.Pos - BattlefieldLayout.PlayerXZ;
                Box(root, float.IsNaN(spawn.SurfaceY) ? "Street post" : "Rooftop post",
                    EnemyCombatRoles.Uniform(spawn.Role, spawn.UniformVariant),
                    216 + relative.x * 1.8f, 190 - relative.y * 1.22f, 8, 8);
            }
            if (!sniper)
                for (int lane = -1; lane <= 1; lane++)
                {
                    Vector2 start = new Vector2(220 + lane * 12, 92);
                    Vector2 end = new Vector2(220 + lane * 8, 168);
                    MapLine(root, start, end, Hostile);
                    MapLine(root, end, end + new Vector2(-5, -10), Hostile);
                    MapLine(root, end, end + new Vector2(5, -10), Hostile);
                }
            return root.gameObject;
        }

        void SelectMap(BattlefieldMap choice)
        {
            if (!gm.IsSelecting) return;
            selectedMap = choice;
            Select(selected);
        }

        public void Select(int index)
        {
            if (!gm.IsSelecting || index < 0 || index >= rows.Length) return;
            // Enter belongs to Deploy, not the last button clicked before a numeric selection.
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            selected = index;
            var weapon = WeaponDefinition.All[index];
            bool sniper = weapon.Mission == MissionType.Sniper;
            bool city = selectedMap == BattlefieldMap.City;
            SetColors(fieldButton, city ? Panel : new Color(.30f, .34f, .25f));
            SetColors(cityButton, city ? new Color(.30f, .34f, .25f) : Panel);
            mapDescription.text = city ? "선택됨: 도시 / 옥상·도로 교전" : "선택됨: 들판 / 나무·바위 엄폐";
            for (int i = 0; i < rows.Length; i++)
            {
                bool active = i == index;
                SetColors(rows[i], active ? new Color(.22f, .25f, .22f) : Panel);
                selectionBars[i].enabled = active;
                rowNames[i].color = active ? Sand : Paper;
                rowStates[i].text = (WeaponDefinition.All[i].Mission == MissionType.Sniper ? "저격 임무" : "진지 방어") + (active ? "   /   선택됨" : "");
            }
            weaponName.text = weapon.Name;
            weaponType.text = weapon.Id == "shotgun" ? "근접 화력  /  펌프액션" : weapon.Fire == FireMode.Bolt ? "정밀 사격  /  볼트액션" : weapon.Fire == FireMode.Auto ? "지속 화력  /  자동 사격" : "단발 사격  /  반자동";
            magazine.text = "장전  " + weapon.MagSize + "발";
            reserve.text = "예비  " + weapon.Reserve + "발";
            reload.text = "재장전  " + weapon.ReloadTime.ToString("0.0") + "초";
            missionTitle.text = sniper ? "잠복 저격" : "진지 방어";
            objective.text = sniper ? "저격병 4명 · 기관총병 6명\n엄폐물 밖으로 나오는 순간을 노리세요." : "기관총병의 접근과 저격병을 막으세요.\n5개 웨이브를 버티면 승리합니다.";
            range.text = sniper ? "교전 거리    45–105 m" : "적 출현 거리    55–95 m";
            rule.text = sniper ? "실수하면 위치가 발각됩니다.\n엄폐 후 시야를 끊어 추적을 피하세요." : "숨었다가 반격하세요.\n웨이브 사이 탄약과 수류탄이 보급됩니다.";
            if (city)
            {
                missionTitle.text = sniper ? "도시 잠복 저격" : "도시 진지 방어";
                objective.text = sniper ? "옥상 6명 · 도로 엄폐물의 적 4명\n난간 밖으로 몸을 드러낼 때 사격하세요."
                    : "옥상 사격조와 도로의 적을 막으세요.\n5개 웨이브를 버티면 승리합니다.";
                range.text = "교전 거리    40–120 m / 옥상 포함";
                rule.text = "옥상 저격병  /  자주색 군복\nC/Ctrl로 검문소 벽 뒤에 숨으세요.";
            }
            sniperMap.SetActive(!city && sniper); defenseMap.SetActive(!city && !sniper);
            citySniperMap.SetActive(city && sniper); cityDefenseMap.SetActive(city && !sniper);
            deployLabel.text = "작전 시작     [ ENTER ]";
            preview.Show(weapon);
        }

        void Deploy()
        {
            if (EventSystem.current != null) EventSystem.current.SetSelectedGameObject(null);
            if (gm != null && gm.IsSelecting)
            {
                if (selectedMap == BattlefieldMap.City && !CityBattlefield.IsReady)
                {
                    mapDescription.text = "도시 에셋 생성 메뉴를 먼저 실행하세요.";
                    Debug.LogError("[Sniper Ridge] Sniper Ridge → 도시 에셋 생성 후 다시 출전하세요.");
                    return;
                }
                gm.StartMission(WeaponDefinition.All[selected], selectedMap);
            }
        }

        void Update()
        {
            Fit();
            // Do not reuse the Enter press that returned from the results screen.
            if (!gm.IsSelecting || Time.frameCount == openedFrame) return;
            for (int i = 0; i < rows.Length && i < 9; i++)
                if (Input.GetKeyDown(KeyCode.Alpha1 + i) || Input.GetKeyDown(KeyCode.Keypad1 + i)) Select(i);
            if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)) Deploy();
        }

        void Fit()
        {
            Vector2 size = backdrop.rect.size;
            if (size == lastSize && content.localScale.x > 0f) return;
            lastSize = size;
            float scale = Mathf.Min(Mathf.Max(1f, size.x - 80f) / 1760f, Mathf.Max(1f, size.y - 64f) / 960f);
            content.localScale = Vector3.one * scale;
        }

        static RectTransform Box(Transform parent, string name, Color color, float x, float y, float width, float height)
            => UiKit.Panel(parent, name, color, TopLeft, TopLeft, TopLeft, new Vector2(x, -y), new Vector2(width, height));

        static Text Label(Transform parent, string name, string text, int size, Color color, float x, float y, float width, float height, bool bold = false, TextAnchor align = TextAnchor.MiddleLeft)
        {
            var label = UiKit.Label(parent, name, text, size, align, color, TopLeft, TopLeft, new Vector2(x, -y), new Vector2(width, height), bold);
            Font font = bold ? boldFont : regularFont;
            if (font != null) { label.font = font; label.fontStyle = FontStyle.Normal; }
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            label.GetComponent<Shadow>().enabled = false;
            return label;
        }

        static Button Button(Transform parent, string name, float x, float y, float width, float height, Color color, UnityEngine.Events.UnityAction action)
        {
            var button = UiKit.TextButton(parent, name, "", 20, Color.white, Paper, TopLeft, TopLeft, new Vector2(x, -y), new Vector2(width, height), action);
            var navigation = button.navigation; navigation.mode = Navigation.Mode.None; button.navigation = navigation;
            SetColors(button, color);
            return button;
        }

        static void SetColors(Button button, Color color)
        {
            var colors = button.colors;
            colors.normalColor = color;
            colors.highlightedColor = Color.Lerp(color, Paper, .13f);
            colors.pressedColor = Color.Lerp(color, Ink, .3f);
            colors.selectedColor = color;
            colors.fadeDuration = .12f;
            button.colors = colors;
        }

        static void MapLine(Transform parent, Vector2 start, Vector2 end, Color color)
        {
            Vector2 delta = end - start;
            var line = Box(parent, "Route", color, start.x, start.y, delta.magnitude, 1.5f);
            line.localRotation = Quaternion.Euler(0, 0, -Mathf.Atan2(delta.y, delta.x) * Mathf.Rad2Deg);
        }
    }
}
