using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge
{
    /// <summary>임무 선택, 임무 진행(저격 / 방어전 웨이브), 점수, 사운드, 적 관리.</summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        public enum GameState { Select, Playing, Won, Lost }
        public GameState State { get; private set; } = GameState.Select;
        public bool IsPlaying => State == GameState.Playing;
        public bool IsSelecting => State == GameState.Select;

        public MissionType Mission { get; private set; }
        public BattlefieldMap Map { get; private set; }
        public static BattlefieldMap LastSelectedMap { get; private set; }
        public WeaponDefinition Weapon { get; private set; }

        public Transform PlayerEye;
        public SniperController Player;
        public PlayerHealth Health;
        public HudController Hud;
        public WindSystem Wind;
        public Terrain Terrain;
        public SoundBank Sounds;
        public AudioSource Ambience;
        public HelicopterFlight Flight { get; private set; }
        public HelicopterRescueMission Rescue { get; private set; }
        public TankBattle Armor { get; private set; }
        public CityAssault Assault { get; private set; }
        GunshotPlayback gunshots;
        public BattleMusic Music { get; private set; }

        public int Kills { get; private set; }
        public int Shots { get; private set; }
        public int Hits { get; private set; }
        public int Headshots { get; private set; }
        public int Score { get; private set; }
        public int TotalEnemies => enemies.Count;
        public float Elapsed => (IsPlaying ? Time.time : endTime) - startTime;

        // 방어전
        public int Wave { get; private set; }
        public int TotalWaves { get; private set; } = 5;
        public bool WaveSpawning { get; private set; }
        public int AliveEnemies
        {
            get
            {
                int n = 0;
                foreach (var e in enemies) if (e != null && !e.IsDead) n++;
                return n;
            }
        }

        readonly List<EnemySoldier> enemies = new List<EnemySoldier>();
        AudioSource[] audioPool;
        int audioIndex;
        float startTime, endTime;
        readonly SniperContact contact = new SniperContact();
        Vector3 defenseAimPoint;
        float nextEnemyAttack;
        public bool PositionRevealed => Mission != MissionType.Sniper || contact.Revealed;
        public float HideProgress => contact.HiddenSeconds / CounterfireRules.LoseContactSeconds;
        public Vector3 EnemyAimPoint => Mission == MissionType.Assault ? Player.AimPoint : Armor != null && Armor.PlayerTank != null ? Armor.PlayerTank.AimPoint : Mission == MissionType.Sniper ? contact.LastKnownPosition : defenseAimPoint;

        void LateUpdate()
        {
            if (!IsPlaying || Player == null) return;
            if (Mission != MissionType.Sniper)
            {
                if (Player.CanFireFromCover) defenseAimPoint = Player.AimPoint;
                return;
            }
            bool visible = false;
            if (contact.Revealed)
                foreach (var enemy in enemies)
                    if (enemy != null && !enemy.IsDead && enemy.CanSee(Player.AimPoint)) { visible = true; break; }
            bool wasRevealed = contact.Revealed;
            contact.Tick(Time.deltaTime, Player.IsHidden, visible, Player.AimPoint);
            if (wasRevealed && !contact.Revealed) Hud.Announce("추적 해제 — 다시 조용히 조준하세요");
        }

        // Stagger squad fire so every enemy cannot start a burst on the same frame.
        public bool TryBeginEnemyAttack()
        {
            if (!IsPlaying || !PositionRevealed || Time.time < nextEnemyAttack) return false;
            nextEnemyAttack = Time.time + (Mission == MissionType.Sniper ? .55f : .32f);
            return true;
        }

        void Awake()
        {
            Instance = this;
            Sounds = SoundBank.Create();
            Music=gameObject.AddComponent<BattleMusic>();Music.Initialize(this);
            gunshots = gameObject.AddComponent<GunshotPlayback>();
            gunshots.Initialize(this);
            audioPool = new AudioSource[Application.isMobilePlatform ? 16 : 32];
            for (int i = 0; i < audioPool.Length; i++)
            {
                var src = gameObject.AddComponent<AudioSource>();
                src.playOnAwake = false;
                src.spatialBlend = 0f;
                audioPool[i] = src;
            }
        }

        void Update()
        {
            // Selection and deployment are handled by TacticalStartMenu.
            if (!IsSelecting && !IsPlaying && (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)))
            {
                Restart();
            }
        }

        // ---------- 임무 시작 ----------

        public void StartMission(WeaponDefinition weapon, BattlefieldMap map = BattlefieldMap.Field)
        {
            if (!IsSelecting) return;
            if (weapon.IsAssault) map = BattlefieldMap.City;
            if (weapon.IsTank)
            {
                map = BattlefieldMap.Field;
                if (!TankVehicle.IsReady)
                { Debug.LogError("[Sniper Ridge] K2와 적 주력전차 에셋 생성 메뉴를 실행하세요."); return; }
            }
            if (map == BattlefieldMap.City && !CityBattlefield.IsReady)
            {
                Debug.LogError("[Sniper Ridge] 도시 에셋이 없습니다. Sniper Ridge → 도시 에셋 생성 메뉴를 실행하세요.");
                return;
            }
            if (weapon.IsMounted && !DoorGunView.IsReady)
            { Debug.LogError("[Sniper Ridge] 헬기 중기관총 에셋 생성 메뉴를 먼저 실행하세요."); return; }
            Weapon = weapon;
            Mission = weapon.Mission;
            Map = map;
            LastSelectedMap = map;
            LevelBuilder.PrepareMap(this);
            State = GameState.Playing;
            startTime = Time.time;
            if (Mission == MissionType.Helicopter) Flight = HelicopterFlight.Create(this);
            if (Mission == MissionType.Tank)
            {
                Armor = TankBattle.Create(this);
                if (Ambience != null) Ambience.volume = .12f;
                Hud.OnMissionStart("햇빛 협곡 · 전차전 5단계\nW/S 전후진 · A/D 차체 회전\n마우스 포탑 조준 · 좌클릭 포격 · 우클릭 확대\n언덕과 바위 사이의 흙길을 따라 적 기갑부대를 격파하세요.");
                return;
            }
            if (Mission == MissionType.Assault)
            {
                Player.AttachToCityAssault(AssaultLayout.Start);
                Player.Equip(weapon);Health.Configure(5f,10f);
                Assault=CityAssault.Create(this);
                Hud.OnMissionStart("왕 처치 작전 · 입구에서 북부 요새까지 진격\n동료 4명과 도시 끝의 왕을 무찌르세요\nTab: 왕까지의 경로 · 적 처치 시 탄약 확보\nWASD 이동 · 좌클릭 사격 · 우클릭 조준\n1 소총 · 2 기관총 · 3 저격총 · 4 로켓포");
                return;
            }
            Player.Equip(weapon);
            defenseAimPoint = Player.AimPoint;
            nextEnemyAttack = Time.time + 2f;

            if (Mission == MissionType.Helicopter)
            {
                Health.Configure(5f, 6f);
                Rescue=HelicopterRescueMission.Create(this);
                Hud.OnMissionStart("헬기 구조 작전 · 동료 20명.\n4개 구조 지점의 경계병을 위에서 제거하세요.\n지점이 안전해지면 헬기가 접근해 5명씩 구조합니다.\n적 로켓 경고가 뜨면 Space 또는 회피 버튼을 누르세요.");
            }
            else if (Mission == MissionType.Sniper)
            {
                Health.Configure(5f, 6f);
                LevelBuilder.SpawnSniperEnemies(this);
                Hud.OnMissionStart(Map == BattlefieldMap.City
                    ? "도시 검문소에 잠복 중.\n옥상 6명과 도로 엄폐물의 적 4명을 제거하라.\n빗나가면 옥상 저격병과 기관총병이 반격한다.\nC/Ctrl 엄폐 · A/D 이동 · 5초 숨으면 추적 해제"
                    : "평지 참호에 잠복 중.\n전방 37~83m의 저격병 4명과 기관총병 6명을 제거하라.\n빗나가거나 적을 살려 두면 위치가 발각된다.\nC/Ctrl로 엄폐 · A/D로 이동 · 5초 숨으면 추적 해제");
            }
            else
            {
                Health.Configure(3f, 12f);
                Hud.OnMissionStart(Map == BattlefieldMap.City
                    ? "도시 진지 방어.\n옥상 저격병·기관총병과 도로의 돌격병을 막아라.\nC/Ctrl로 숨고 A/D로 피한 뒤 반격하라.\n5개 웨이브를 모두 막아내라."
                    : "진지 방어.\n기관총병이 연사하며 접근하고 양옆 저격병이 엄폐 사격한다.\nC/Ctrl로 숨고 A/D로 피한 뒤 반격하라.\n" + TotalWaves + "개 웨이브를 모두 막아내라.");
                StartCoroutine(RunWaves());
            }
        }

        IEnumerator RunWaves()
        {
            yield return new WaitForSeconds(4f);
            var rng = new System.Random();
            for (int wave = 1; wave <= TotalWaves && IsPlaying; wave++)
            {
                Wave = wave;
                int count = 6 + wave * 4;
                Hud.Announce(string.Format("웨이브 {0} / {1}   적 {2}명", wave, TotalWaves, count));
                PlaySound(Sounds.Bolt, 0.6f, 0.6f);

                WaveSpawning = true;
                var waveEnemies = new List<EnemySoldier>();
                for (int i = 0; i < count && IsPlaying; i++)
                {
                    var e = LevelBuilder.SpawnDefenseSoldier(this, rng, wave, i);
                    waveEnemies.Add(e);
                    yield return new WaitForSeconds(Mathf.Lerp(0.9f, 0.45f, (wave - 1f) / (TotalWaves - 1f)));
                }
                WaveSpawning = false;

                while (IsPlaying)
                {
                    bool anyAlive = false;
                    foreach (var e in waveEnemies) if (e != null && !e.IsDead) { anyAlive = true; break; }
                    if (!anyAlive) break;
                    yield return new WaitForSeconds(0.5f);
                }
                if (!IsPlaying) yield break;

                if (wave < TotalWaves)
                {
                    int resupply = Mathf.RoundToInt(Weapon.Reserve * 0.4f);
                    int bulletsAdded = Player.Resupply(resupply);
                    int rocketsAdded = Player.ResupplyRockets(2);
                    int grenadesAdded = Player.Grenades.Resupply(2);
                    Hud.Announce(string.Format("재보급  총알 +{0} / 로켓 +{1} / 수류탄 +{2} · 8초 후 증원", bulletsAdded, rocketsAdded, grenadesAdded));
                    Score += 500 * wave;
                    yield return new WaitForSeconds(8f);
                }
            }
            if (IsPlaying) EndMission(true);
        }

        public void RegisterEnemy(EnemySoldier e) => enemies.Add(e);

        // ---------- 사운드 ----------

        public void PlayPlayerShot(string id, float volume) { Music.Duck();gunshots.Play(id, volume); }

        public void PlaySound(AudioClip clip, float volume = 1f, float pitch = 1f, float pan = 0f)
        {
            if (clip == null) return;
            // Each voice owns one clip and pitch. Reusing a PlayOneShot source while its
            // previous tail is playing changes that tail's pitch along with the new shot.
            int selected = audioIndex;
            for (int i = 0; i < audioPool.Length; i++)
            {
                int candidate = (audioIndex + i) % audioPool.Length;
                if (!audioPool[candidate].isPlaying) { selected = candidate; break; }
            }
            var src = audioPool[selected];
            audioIndex = (selected + 1) % audioPool.Length;
            // If the bounded pool is full, replace one voice instead of stacking clips on it.
            src.Stop();
            src.clip = clip;
            src.volume = Mathf.Clamp01(volume);
            src.pitch = pitch;
            src.panStereo = Mathf.Clamp(pan, -1f, 1f);
            src.Play();
        }

        // ---------- 플레이어 사격 관련 ----------

        public void OnPlayerShot(Vector3 shotPosition)
        {
            Music.Duck();Shots++;
            if (Mission == MissionType.Sniper && contact.Revealed)
                contact.Reveal(shotPosition - Vector3.up * .18f);
        }

        public void OnPlayerShotResolved(bool cleanKill, Vector3 shotPosition)
        {
            if (!IsPlaying || Mission != MissionType.Sniper || cleanKill) return;
            bool first = !contact.Revealed;
            contact.Reveal(shotPosition - Vector3.up * .18f);
            foreach (var enemy in enemies)
                if (enemy != null && !enemy.IsDead) enemy.SetAware();
            if (first) Hud.Announce("위치 발각! C/Ctrl로 5초 엄폐");
        }

        public void NotifyBulletPass(Vector3 a, Vector3 b)
        {
            if (Mission != MissionType.Sniper && Mission != MissionType.Assault) return;
            foreach (var e in enemies)
            {
                if (e == null || e.IsDead) continue;
                Vector3 c = e.transform.position + Vector3.up*(Mission==MissionType.Assault?1.3f:1f);
                Vector3 segment=b-a;
                Vector3 closest=a+segment*Mathf.Clamp01(Vector3.Dot(c-a,segment)/Mathf.Max(segment.sqrMagnitude,.0001f));
                // Begin just before an impact surface so an origin on the wall cannot miss its collider.
                Vector3 probe=closest-segment.normalized*.03f;
                if (DistancePointSegment(c, a, b) < 2.5f &&
                    (Mission!=MissionType.Assault || !EnemyProjectile.WorldHit(probe,c,e,out _)))
                    e.Alert(Random.Range(3f, 7f));
            }
        }

        public void OnBulletImpact(Vector3 point)
        {
            if (Mission != MissionType.Sniper) return;
            foreach (var e in enemies)
            {
                if (e == null || e.IsDead) continue;
                if (Vector3.Distance(e.transform.position, point) < 15f)
                    e.Alert(Random.Range(4f, 8f));
            }
        }

        public void OnEnemyHit(EnemySoldier e, bool headshot, float distance, bool killed, bool countHit = true)
        {
            if (!IsPlaying) return;
            if (countHit) Hits++;
            Hud.ShowHitMarker(headshot, killed);
            if (!killed)
            {
                PlaySound(Sounds.HitTick, 0.35f, 1.3f);
                return;
            }

            Kills++;
            if (headshot) Headshots++;
            int points = (headshot ? 250 : 100) + Mathf.RoundToInt(distance * 0.5f);
            Score += points;
            if (Mission == MissionType.Sniper)
            {
                Hud.KillFeed(headshot
                    ? string.Format("헤드샷!  +{0}  ({1:0} m)", points, distance)
                    : string.Format("명중  +{0}  ({1:0} m)", points, distance));
            }
            else
            {
                Hud.KillFeed(headshot ? string.Format("헤드샷!  +{0}", points) : string.Format("+{0}", points));
            }
            PlaySound(Sounds.HitTick, 0.8f);
            if(Mission==MissionType.Helicopter&&Rescue!=null)Rescue.OnEnemyKilled(e);
            if (Mission == MissionType.Sniper && Kills >= enemies.Count) EndMission(true);
        }

        // ---------- 적 사격 관련 ----------

        public IEnumerator EnemyShotSound(Vector3 origin, string shotId = "distant")
        {
            float distance = Vector3.Distance(origin, PlayerEye.position);
            yield return new WaitForSeconds(distance / 340f);
            if (!IsPlaying) yield break;
            Vector3 direction = PlayerEye.InverseTransformDirection((origin - PlayerEye.position).normalized);
            PlaySound(Sounds.Shot(shotId, Map == BattlefieldMap.City),
                Mathf.Clamp01(1.1f - distance / 900f) * .35f, 1f, direction.x * .8f);
        }

        public void OnArmorHit(TankVehicle tank,bool killed,bool countHit)
        {
            if (!IsPlaying) return;
            if (countHit) Hits++;
            Hud.ShowHitMarker(false, killed);
            if (killed) { Kills++; Score+=600; Hud.KillFeed("적 전차 격파 +600"); }
            else Hud.ShowShotFeedback(string.Format("{0} 직격 {1}/{2} · 격파까지 {3}발",tank.DisplayName,tank.ShellHits,tank.HitsToDestroy,tank.RemainingShellHits));
        }
        public void AddScore(int points){Score+=Mathf.Max(0,points);}
        public void CompleteAssault() { if (Mission == MissionType.Assault) EndMission(true); }
        public void CompleteArmoredMission() { if (Mission == MissionType.Tank) EndMission(true); }
        public void CompleteHelicopterMission() { if (Mission == MissionType.Helicopter && Rescue!=null && Rescue.Rescued>=HelicopterRescueMission.TotalSurvivors) EndMission(true); }
        public void PlayerDied() => EndMission(false);

        void EndMission(bool won)
        {
            if (!IsPlaying) return;
            State = won ? GameState.Won : GameState.Lost;
            endTime = Time.time;
            if (Flight != null) Flight.StopFlight();
            if (Armor != null) Armor.StopBattle();
            Player.OnMissionEnd();
            Hud.ShowEnd(won);
        }

        public void Restart()
        {
            var scene = SceneManager.GetActiveScene();
            if (scene.buildIndex >= 0)
            {
                SceneManager.LoadScene(scene.buildIndex);
            }
            else
            {
                foreach (var root in scene.GetRootGameObjects()) Destroy(root);
                LevelBuilder.ScheduleRebuild();
            }
        }

        static float DistancePointSegment(Vector3 p, Vector3 a, Vector3 b)
        {
            Vector3 ab = b - a;
            float len2 = ab.sqrMagnitude;
            if (len2 < 0.0001f) return Vector3.Distance(p, a);
            float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / len2);
            return Vector3.Distance(p, a + ab * t);
        }
    }
}
