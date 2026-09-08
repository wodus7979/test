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
        public WeaponDefinition Weapon { get; private set; }

        public Transform PlayerEye;
        public SniperController Player;
        public PlayerHealth Health;
        public HudController Hud;
        public WindSystem Wind;
        public Terrain Terrain;
        public SoundBank Sounds;

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

        void Awake()
        {
            Instance = this;
            Sounds = SoundBank.Create();
            audioPool = new AudioSource[8];
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
            if (IsSelecting)
            {
                for (int i = 0; i < WeaponDefinition.All.Length && i < 9; i++)
                {
                    if (Input.GetKeyDown(KeyCode.Alpha1 + i) || Input.GetKeyDown(KeyCode.Keypad1 + i))
                        StartMission(WeaponDefinition.All[i]);
                }
            }
            else if (!IsPlaying && (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)))
            {
                Restart();
            }
        }

        // ---------- 임무 시작 ----------

        public void StartMission(WeaponDefinition weapon)
        {
            if (!IsSelecting) return;
            Weapon = weapon;
            Mission = weapon.Mission;
            State = GameState.Playing;
            startTime = Time.time;
            Player.Equip(weapon);

            if (Mission == MissionType.Sniper)
            {
                Health.Configure(5f, 6f);
                LevelBuilder.SpawnSniperEnemies(this);
                Hud.OnMissionStart("능선에 잠복 중.\n맞은편 능선의 바위와 나무 뒤에 숨은 적을 모두 제거하라.\n첫 발 이후 적은 경계 태세로 전환해 반격한다.");
            }
            else
            {
                Health.Configure(3f, 12f);
                Hud.OnMissionStart("진지 방어.\n맞은편 사면에서 적이 웨이브로 몰려온다.\n" + TotalWaves + "개 웨이브를 모두 막아내라.");
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
                    float x = (float)(rng.NextDouble() * 260.0 - 130.0);
                    float z = (float)(40.0 + rng.NextDouble() * 110.0 + Mathf.Min(wave, 4) * 6.0);
                    var e = LevelBuilder.SpawnRusher(this, new Vector2(x, z), "Rusher_" + wave + "_" + (i + 1));
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
                    Player.Resupply(resupply);
                    Hud.Announce(string.Format("웨이브 격퇴!  탄약 재보급 +{0}발   다음 웨이브까지 8초", resupply));
                    Score += 500 * wave;
                    yield return new WaitForSeconds(8f);
                }
            }
            if (IsPlaying) EndMission(true);
        }

        public void RegisterEnemy(EnemySoldier e) => enemies.Add(e);

        // ---------- 사운드 ----------

        public void PlaySound(AudioClip clip, float volume = 1f, float pitch = 1f)
        {
            if (clip == null) return;
            var src = audioPool[audioIndex];
            audioIndex = (audioIndex + 1) % audioPool.Length;
            src.pitch = pitch;
            src.PlayOneShot(clip, volume);
        }

        // ---------- 플레이어 사격 관련 ----------

        public void OnPlayerShot()
        {
            Shots++;
            if (Mission != MissionType.Sniper) return;
            foreach (var e in enemies)
            {
                if (e == null || e.IsDead || e.IsAware) continue;
                float delay = Vector3.Distance(e.transform.position, PlayerEye.position) / 340f;
                StartCoroutine(AwareAfter(e, delay));
            }
        }

        IEnumerator AwareAfter(EnemySoldier e, float delay)
        {
            yield return new WaitForSeconds(delay);
            if (e != null) e.SetAware();
        }

        public void NotifyBulletPass(Vector3 a, Vector3 b)
        {
            if (Mission != MissionType.Sniper) return;
            foreach (var e in enemies)
            {
                if (e == null || e.IsDead) continue;
                Vector3 c = e.transform.position + Vector3.up;
                if (DistancePointSegment(c, a, b) < 2.5f)
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

        public void OnEnemyHit(EnemySoldier e, bool headshot, float distance, bool killed)
        {
            if (!IsPlaying) return;
            Hits++;
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

            if (Mission == MissionType.Sniper && Kills >= enemies.Count) EndMission(true);
        }

        // ---------- 적 사격 관련 ----------

        public IEnumerator EnemyShotArrival(float dist, bool hit, float damage)
        {
            float bulletT = dist / 800f;
            float soundT = dist / 340f;
            yield return new WaitForSeconds(bulletT);
            if (IsPlaying)
            {
                if (hit) Health.TakeDamage(damage);
                else PlaySound(Sounds.Crack, 0.5f, Random.Range(0.9f, 1.1f));
            }
            yield return new WaitForSeconds(Mathf.Max(0f, soundT - bulletT));
            PlaySound(Sounds.DistantShot, Mathf.Clamp01(1.1f - dist / 900f) * 0.6f, Random.Range(0.85f, 1.05f));
        }

        public void PlayerDied() => EndMission(false);

        void EndMission(bool won)
        {
            if (!IsPlaying) return;
            State = won ? GameState.Won : GameState.Lost;
            endTime = Time.time;
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
