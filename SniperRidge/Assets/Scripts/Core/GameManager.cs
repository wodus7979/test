using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge
{
    /// <summary>임무 상태, 점수, 사운드, 적 관리.</summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        public enum GameState { Playing, Won, Lost }
        public GameState State { get; private set; } = GameState.Playing;
        public bool IsPlaying => State == GameState.Playing;

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

        readonly List<EnemySoldier> enemies = new List<EnemySoldier>();
        AudioSource[] audioPool;
        int audioIndex;
        float startTime, endTime;

        void Awake()
        {
            Instance = this;
            Sounds = SoundBank.Create();
            audioPool = new AudioSource[6];
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
            if (!IsPlaying && (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)))
                Restart();
        }

        public void BeginMission()
        {
            State = GameState.Playing;
            startTime = Time.time;
        }

        public void RegisterEnemy(EnemySoldier e) => enemies.Add(e);

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
            foreach (var e in enemies)
            {
                if (e.IsDead || e.IsAware) continue;
                float delay = Vector3.Distance(e.transform.position, PlayerEye.position) / 340f;
                StartCoroutine(AwareAfter(e, delay));
            }
        }

        IEnumerator AwareAfter(EnemySoldier e, float delay)
        {
            yield return new WaitForSeconds(delay);
            if (e != null) e.SetAware();
        }

        /// <summary>탄이 적 근처를 스쳐 지나가면 경계.</summary>
        public void NotifyBulletPass(Vector3 a, Vector3 b)
        {
            foreach (var e in enemies)
            {
                if (e.IsDead) continue;
                Vector3 c = e.transform.position + Vector3.up;
                if (DistancePointSegment(c, a, b) < 2.5f)
                    e.Alert(Random.Range(3f, 7f));
            }
        }

        public void OnBulletImpact(Vector3 point)
        {
            foreach (var e in enemies)
            {
                if (e.IsDead) continue;
                if (Vector3.Distance(e.transform.position, point) < 15f)
                    e.Alert(Random.Range(4f, 8f));
            }
        }

        public void OnEnemyKilled(EnemySoldier e, bool headshot, float distance)
        {
            if (!IsPlaying) return;
            Kills++;
            Hits++;
            if (headshot) Headshots++;
            int points = (headshot ? 250 : 100) + Mathf.RoundToInt(distance * 0.5f);
            Score += points;

            Hud.ShowHitMarker(headshot);
            Hud.KillFeed(headshot
                ? string.Format("헤드샷!  +{0}  ({1:0} m)", points, distance)
                : string.Format("명중  +{0}  ({1:0} m)", points, distance));
            PlaySound(Sounds.HitTick, 0.8f);

            if (Kills >= enemies.Count) EndMission(true);
        }

        // ---------- 적 사격 관련 ----------

        public IEnumerator EnemyShotArrival(float dist, bool hit)
        {
            float bulletT = dist / 800f;
            float soundT = dist / 340f;
            yield return new WaitForSeconds(bulletT);
            if (IsPlaying)
            {
                if (hit) Health.TakeDamage(Random.Range(18f, 26f));
                else PlaySound(Sounds.Crack, 0.5f, Random.Range(0.9f, 1.1f));
            }
            yield return new WaitForSeconds(Mathf.Max(0f, soundT - bulletT));
            PlaySound(Sounds.DistantShot, Mathf.Clamp01(1.1f - dist / 900f) * 0.7f, Random.Range(0.85f, 1f));
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
