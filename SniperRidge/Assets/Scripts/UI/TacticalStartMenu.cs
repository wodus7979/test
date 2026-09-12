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
        Text mapDescription, controls;
        RectTransform equipmentLeft, equipmentRight;
        GameObject orbitMap, tankMap, assaultMap;
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
            controls = Label(content, "Controls", "C / Ctrl  엄폐     A / D  좌우 이동     우클릭  조준     R  재장전", 22, Paper, 0, 879, 1210, 34);
            Label(content, "Selection help", "클릭 또는 1–9 / 0: 모드 선택    ·    Enter: 작전 시작   ·   M: BGM", 20, Muted, 0, 922, 1210, 30);
            var deploy = Button(content, "Deploy", 1264, 878, 496, 74, Sand, Deploy);
            deployLabel = Label(deploy.transform, "Action", "", 28, Ink, 24, 0, 448, 74, true, TextAnchor.MiddleCenter);
            Select(9);
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
                var button = Button(content, "Weapon_" + weapon.Id, 0, 260 + i * 58, 400, 52, Panel, () => Select(index));
                rows[i] = button;
                selectionBars[i] = Box(button.transform, "Selection", Sand, 0, 0, 4, 52).GetComponent<Image>();
                Label(button.transform, "Key", i == 9 ? "0" : (i + 1).ToString("00"), 22, Muted, 20, 16, 40, 32, true);
                rowNames[i] = Label(button.transform, "Name", weapon.Name, 23, Paper, 76, 1, 304, 29, true);
                rowStates[i] = Label(button.transform, "Mission", "", 16, Muted, 77, 29, 300, 21);
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
            equipmentLeft = EquipmentCard(432, "Q", "로켓포", "주무기와 즉시 교체 · 예비 8발");
            equipmentRight = EquipmentCard(848, "W", "수류탄", "6개 지급 · 누르고 조준, 놓아 투척");
        }

        RectTransform EquipmentCard(float x, string key, string title, string text)
        {
            var panel = Box(content, title, Panel, x, 710, 384, 114);
            Box(panel, "Key background", Line, 20, 20, 42, 38);
            Label(panel, "Key", key, 23, Sand, 20, 20, 42, 38, true, TextAnchor.MiddleCenter);
            Label(panel, "Name", title, 25, Paper, 78, 21, 278, 38, true);
            Label(panel, "Description", text, 18, Muted, 20, 73, 346, 28);
            return panel;
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
            orbitMap = Box(map, "Helicopter orbit", Color.clear, 0, 0, 440, 238).gameObject;
            for (int i = 0; i < 48; i++)
            {
                float a = i * Mathf.PI * 2f / 48f, b = (i + 1) * Mathf.PI * 2f / 48f;
                MapLine(orbitMap.transform, new Vector2(220 + Mathf.Sin(a) * 160, 125 + Mathf.Cos(a) * 75),
                    new Vector2(220 + Mathf.Sin(b) * 160, 125 + Mathf.Cos(b) * 75), Sand);
            }
            for(int i=0;i<HelicopterRescueMission.SiteCount;i++)
            {
                float angle=(45+i*90)*Mathf.Deg2Rad;
                var rescue=Box(orbitMap.transform,"Rescue site",new Color(.2f,.75f,1f),216+Mathf.Sin(angle)*68,121+Mathf.Cos(angle)*42,10,10);
                rescue.localRotation=Quaternion.Euler(0,0,45);
            }
            Label(orbitMap.transform, "Orbit label", "4개 지점 · 동료 20명 구조", 18, Sand, 205, 194, 225, 28);
            tankMap = Box(map,"Tank positions",Ink,0,0,440,238).gameObject;
            Label(tankMap.transform,"Tank legend","K2 흑표  ◆     적 주력전차  ■     단계별 증원  ↓",18,Muted,18,8,410,28);
            for(int i=0;i<6;i++)
            {
                var p=TankBattle.Post(i);
                bool k2=i%2==0;
                var marker=Box(tankMap.transform,"Enemy tank approach",k2?Hostile:new Color(0.78f,0.57f,0.25f),216+p.x*.85f,116-p.z*.7f,k2?9:10,k2?9:10);
                marker.localRotation=Quaternion.Euler(0,0,k2?45:0);
            }
            Label(tankMap.transform,"Player tank","▲ 아군 전차",17,Sand,180,202,150,26);
            foreach(int side in new[]{-1,1})
                MapLine(tankMap.transform,new Vector2(220+side*160,60),new Vector2(220+side*105,110),Hostile);
            assaultMap=Box(map,"Urban FPS route",Ink,0,0,440,238).gameObject;
            for(int x=40;x<440;x+=40)MapLine(assaultMap.transform,new Vector2(x,28),new Vector2(x,217),Line);
            for(int z=38;z<218;z+=25)MapLine(assaultMap.transform,new Vector2(20,z),new Vector2(420,z),Line);
            for(int i=0;i<AssaultLayout.Objectives.Length;i++)
            {
                var p=AssaultLayout.Objectives[i];var q=new Vector2(220+p.x*1.25f,122-p.z*.72f);
                Box(assaultMap.transform,"Objective "+i,Sand,q.x-4,q.y-4,8,8);
                Label(assaultMap.transform,"Sector "+i,(i+1).ToString(),16,Paper,q.x+6,q.y-10,26,24);
                if(i>0){var previous=AssaultLayout.Objectives[i-1];MapLine(assaultMap.transform,new Vector2(220+previous.x*1.25f,122-previous.z*.72f),q,Sand);}
            }
            Label(assaultMap.transform,"Urban legend","입구 → 북부 요새 · 5인 분대 돌파",17,Sand,12,4,412,25);
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
            bool tank = weapon.IsTank;
            bool fps = weapon.IsAssault;
            if(fps)selectedMap=BattlefieldMap.City;
            fieldButton.interactable=!fps;
            if (tank) selectedMap = BattlefieldMap.Field;
            cityButton.interactable = !tank;
            bool air = weapon.IsMounted;
            bool sniper = weapon.Mission != MissionType.Defense;
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
                rowStates[i].text = (WeaponDefinition.All[i].IsAssault ? "왕 처치 · 동료 4명" : WeaponDefinition.All[i].IsTank ? "K2 흑표 기동전 · 5단계" : WeaponDefinition.All[i].IsMounted ? "공중 구조 · 동료 20명" : WeaponDefinition.All[i].Mission == MissionType.Sniper ? "저격 임무" : "진지 방어") + (active ? "   /   선택됨" : "");
            }
            weaponName.text = weapon.Name;
            weaponType.text = weapon.Id == "shotgun" ? "근접 화력  /  펌프액션" : weapon.Fire == FireMode.Bolt ? "정밀 사격  /  볼트액션" : weapon.Fire == FireMode.Auto ? "지속 화력  /  자동 사격" : "단발 사격  /  반자동";
            magazine.text = "장전  " + weapon.MagSize + "발";
            reserve.text = "예비  " + weapon.Reserve + "발";
            reload.text = "재장전  " + weapon.ReloadTime.ToString("0.0") + "초";
            missionTitle.text = sniper ? "잠복 저격" : "진지 방어";
            objective.text = sniper ? "저격병 4명 · 기관총병 6명\n엄폐물 밖으로 나오는 순간을 노리세요." : "기관총병의 접근과 저격병을 막으세요.\n5개 웨이브를 버티면 승리합니다.";
            range.text = sniper ? "교전 거리    37–83 m" : "적 출현 거리    37–68 m";
            rule.text = sniper ? "실수하면 위치가 발각됩니다.\n엄폐 후 시야를 끊어 추적을 피하세요." : "숨었다가 반격하세요.\n웨이브 사이 탄약과 수류탄이 보급됩니다.";
            if (city)
            {
                missionTitle.text = sniper ? "도시 잠복 저격" : "도시 진지 방어";
                objective.text = sniper ? "옥상 6명 · 도로 엄폐물의 적 4명\n난간 밖으로 몸을 드러낼 때 사격하세요."
                    : "옥상 사격조와 도로의 적을 막으세요.\n5개 웨이브를 버티면 승리합니다.";
                range.text = "교전 거리    40–120 m / 옥상 포함";
                rule.text = "옥상 저격병  /  자주색 군복\nC/Ctrl로 검문소 벽 뒤에 숨으세요.";
            }
            if (air)
            {
                weaponType.text = "공중 화력  /  옆문 거치식 중기관총";
                missionTitle.text = city ? "도시 공중 구조" : "들판 공중 구조";
                objective.text = "4개 구조 지점의 경계병을 제거하고\n동료 20명을 5명씩 구조하세요.";
                range.text = city ? "고도 66 m  /  선회 52초" : "고도 44 m  /  선회 52초";
                rule.text = "적 로켓 경고 시 Space 회피\n안전해진 구조 지점 위로 접근하세요.";
            }
            controls.text = air ? "마우스  조준     좌클릭  연사     Space  로켓 회피     우클릭  확대     R  탄띠 교체"
                : "C / Ctrl  엄폐     A / D  좌우 이동     우클릭  조준     R  재장전";
            SetCard(equipmentLeft, air ? "R" : "Q", air ? "250발 탄띠" : "로켓포",
                air ? "예비 2,000발 · 탄띠 교체 4초" : "주무기와 즉시 교체 · 예비 8발");
            SetCard(equipmentRight, air ? "SPACE" : "W", air ? "로켓 회피" : "수류탄",
                air ? "경고 후 눌러 급격한 측면 기동" : "6개 지급 · 누르고 조준, 놓아 투척");
            if (tank)
            {
                mapDescription.text = "전차 전장 / 넓은 들판 · 숲 · 바위";
                weaponType.text = "K2 흑표  /  차체 주행 · 독립 포탑";
                missionTitle.text = "K2 흑표 기동전";
                magazine.text = "포탄 60발"; reserve.text = "단계마다 +25발";
                objective.text = "보병 없이 전차끼리 교전합니다.\n적 K2와 다른 주력전차를 모두 격파하세요.";
                range.text = "기동 구역    440 × 440 m";
                rule.text = "W/S 전후진 · A/D 차체 회전\n마우스 조준 · 좌클릭 포격";
                controls.text = "W  전진   S  후진   A/D  차체 회전   마우스  포탑 조준   좌클릭  포격   우클릭  확대";
                SetCard(equipmentLeft,"W","전차 직접 조종","최대 43 km/h · 차체와 포탑 분리");
                SetCard(equipmentRight,"5","단계별 증원","적 전차 1 → 2 → 3 → 4 → 5대");
            }
            if(fps)
            {
                mapDescription.text="도시 FPS / 주거단지 · 공장 · 검문소";
                weaponType.text="돌격소총 / 보병 자유 이동";missionTitle.text="왕 처치 작전";
                objective.text="입구에서 출발해 도시 끝의 왕을 무찌르세요.\n왕의 방어구·기관총·로켓 공격에 대비하세요.";
                range.text="입구 → 북부 요새 / 최종 보스";
                rule.text="적 처치 시 예비 탄약 자동 확보\n왕 처치로 승리 · 로켓 예고 후 이동/엄폐";
                controls.text="WASD 이동   Tab 지도   1~4 무기   좌클릭 사격   우클릭 조준   R 장전   G 수류탄";
                SetCard(equipmentLeft,"W","자유 이동","골목·상점·차량을 활용해 접근");
                SetCard(equipmentRight,"G","수류탄 조준","누르고 위치 지정 · 놓아 투척");
            }
            orbitMap.SetActive(air); tankMap.SetActive(tank);assaultMap.SetActive(fps);
            map.Find("Trench").gameObject.SetActive(!air && !tank && !fps);
            map.Find("Player").gameObject.SetActive(!air && !tank && !fps);
            sniperMap.SetActive(!tank && !city && sniper); defenseMap.SetActive(!tank && !city && !sniper);
            citySniperMap.SetActive(!fps && city && sniper); cityDefenseMap.SetActive(!fps && city && !sniper);
            deployLabel.text = "작전 시작     [ ENTER ]";
            preview.Show(weapon);
        }

        static void SetCard(RectTransform card, string key, string name, string description)
        {
            card.Find("Key").GetComponent<Text>().text = key;
            card.Find("Name").GetComponent<Text>().text = name;
            card.Find("Description").GetComponent<Text>().text = description;
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
                if (WeaponDefinition.All[selected].IsTank && !TankVehicle.IsReady)
                { mapDescription.text = "K2·적 주력전차 에셋 생성 메뉴를 실행하세요."; return; }
                if (WeaponDefinition.All[selected].IsMounted && !DoorGunView.IsReady)
                { mapDescription.text = "헬기 중기관총 에셋 생성 메뉴를 실행하세요."; return; }
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
            if(Input.GetKeyDown(KeyCode.Alpha0)||Input.GetKeyDown(KeyCode.Keypad0))Select(9);
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
