using UnityEngine;

namespace SniperRidge
{
    public enum FireMode { Bolt, Semi, Auto }
    public enum MissionType { Sniper, Defense }

    /// <summary>무기 하나의 성능 정의. 실제 총기명 대신 종류 이름을 쓴다.</summary>
    public class WeaponDefinition
    {
        public string Id;
        public string Name;
        public string Description;
        public MissionType Mission;
        public FireMode Fire;

        public float RoundsPerMinute;   // Semi/Auto 발사 간격 계산용
        public float BoltTime;          // Bolt 전용: 노리쇠 작동 시간
        public int MagSize;
        public int Reserve;
        public float ReloadTime;

        public float MuzzleVelocity;    // m/s
        public float DragK;             // 공기저항
        public float Damage;            // 몸통 피해 (적 체력 100, 헤드샷 3배)

        public float[] ScopeFovs;
        public string[] ScopeLabels;
        public int DefaultZoomIndex;
        public bool HasZeroing;

        public float RecoilKick;        // 발당 시각 반동 (도)
        public float RecoilClimb;       // 발당 실제 조준점 상승 비율
        public float SwayScoped;
        public float SwayHip;
        public float HipSpread;         // 비조준 산포 (도)
        public float AdsSpread;         // 조준 산포 (도)

        public float ShotVolume;
        public float ShotPitch;

        public string ModelName;        // Resources/Weapons/Prefabs/<ModelName> (Firearm Asset Pack)
        public bool IsRocket;
        public int Pellets = 1;         // 샷건: 한 발에 나가는 산탄 수
        public Vector3 ViewOffset = new Vector3(0.22f, -0.2f, 0.38f);   // 1인칭 위치

        public float Interval => 60f / RoundsPerMinute;

        // Secondary equipment shared by both missions; never changes the selected mission.
        public static readonly WeaponDefinition Launcher = new WeaponDefinition
        {
            Id = "launcher", Name = "로켓포", IsRocket = true, Fire = FireMode.Semi,
            Description = "범위 피해 · 1발 장전 / 예비 8발 · Q로 주무기 복귀",
            RoundsPerMinute = 30f, MagSize = 1, Reserve = 8, ReloadTime = 3.2f,
            MuzzleVelocity = 150f, Damage = 220f, DragK = 0f,
            ScopeFovs = new[] { 30f }, ScopeLabels = new[] { "2x" },
            RecoilKick = 3f, RecoilClimb = .1f, SwayScoped = .2f, SwayHip = .6f,
            HipSpread = .15f, AdsSpread = 0f, ShotVolume = 1f, ShotPitch = 1f,
            ModelName = "launcher_reusable", ViewOffset = new Vector3(.27f, -.30f, .42f),
        };

        public static readonly WeaponDefinition[] All =
        {
            new WeaponDefinition
            {
                Id = "sniper", Name = "볼트액션 저격소총",
                Description = "7.62mm 볼트액션. 5발 탄창(예비 80발), 4~16배 조준경.\n임무: 평지 잠복 저격 (적 10명)",
                Mission = MissionType.Sniper, Fire = FireMode.Bolt,
                RoundsPerMinute = 40f, BoltTime = 1.15f, MagSize = 5, Reserve = 80, ReloadTime = 2.6f,
                MuzzleVelocity = 850f, DragK = 0.00087f, Damage = 100f,
                ScopeFovs = new[] { 15f, 7.5f, 3.75f }, ScopeLabels = new[] { "4x", "8x", "16x" }, DefaultZoomIndex = 0, HasZeroing = true,
                RecoilKick = 2.4f, RecoilClimb = 0f, SwayScoped = 0.32f, SwayHip = 0.9f, HipSpread = 0f, AdsSpread = 0f,
                ShotVolume = 1f, ShotPitch = 0.9f,
                ModelName = "01_precision_rifle", ViewOffset = new Vector3(0.2f, -0.19f, 0.42f),
            },
            new WeaponDefinition
            {
                Id = "dmr", Name = "지정사수 소총",
                Description = "7.62mm 반자동. 10발 탄창(예비 150발), 4~8배 조준경. 반동이 큼.\n임무: 평지 잠복 저격 (적 10명)",
                Mission = MissionType.Sniper, Fire = FireMode.Semi,
                RoundsPerMinute = 180f, BoltTime = 0f, MagSize = 10, Reserve = 150, ReloadTime = 2.4f,
                MuzzleVelocity = 800f, DragK = 0.00095f, Damage = 90f,
                ScopeFovs = new[] { 15f, 7.5f }, ScopeLabels = new[] { "4x", "8x" }, DefaultZoomIndex = 0, HasZeroing = true,
                RecoilKick = 1.4f, RecoilClimb = 0.12f, SwayScoped = 0.4f, SwayHip = 1.0f, HipSpread = 0.5f, AdsSpread = 0.06f,
                ShotVolume = 0.95f, ShotPitch = 1.0f,
                ModelName = "01_precision_rifle", ViewOffset = new Vector3(0.2f, -0.19f, 0.42f),
            },
            new WeaponDefinition
            {
                Id = "rifle", Name = "돌격소총",
                Description = "5.56mm 자동. 30발 탄창(예비 480발), 2~4배 광학 조준기.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Auto,
                RoundsPerMinute = 650f, BoltTime = 0f, MagSize = 30, Reserve = 480, ReloadTime = 2.2f,
                MuzzleVelocity = 900f, DragK = 0.0012f, Damage = 40f,
                ScopeFovs = new[] { 30f, 15f }, ScopeLabels = new[] { "2x", "4x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 0.55f, RecoilClimb = 0.25f, SwayScoped = 0.45f, SwayHip = 1.1f, HipSpread = 2.2f, AdsSpread = 0.35f,
                ShotVolume = 0.75f, ShotPitch = 1.3f,
                ModelName = "03_assault_rifle", ViewOffset = new Vector3(0.2f, -0.2f, 0.36f),
            },
            new WeaponDefinition
            {
                Id = "lmg", Name = "경기관총",
                Description = "7.62mm 자동, 100발 탄띠(예비 900발). 조준 시 산포 감소, 재장전이 느림.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Auto,
                RoundsPerMinute = 700f, BoltTime = 0f, MagSize = 100, Reserve = 900, ReloadTime = 4.5f,
                MuzzleVelocity = 850f, DragK = 0.001f, Damage = 45f,
                ScopeFovs = new[] { 40f, 20f }, ScopeLabels = new[] { "1.5x", "3x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 0.7f, RecoilClimb = 0.18f, SwayScoped = 0.3f, SwayHip = 1.4f, HipSpread = 3.2f, AdsSpread = 0.7f,
                ShotVolume = 0.85f, ShotPitch = 1.1f,
                ModelName = "02_light_machine_gun", ViewOffset = new Vector3(0.22f, -0.21f, 0.36f),
            },
            new WeaponDefinition
            {
                Id = "smg", Name = "기관단총",
                Description = "9mm 자동 900발/분. 30발 탄창(예비 600발), 가볍지만 사거리가 짧음.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Auto,
                RoundsPerMinute = 900f, BoltTime = 0f, MagSize = 30, Reserve = 600, ReloadTime = 1.9f,
                MuzzleVelocity = 400f, DragK = 0.0025f, Damage = 26f,
                ScopeFovs = new[] { 40f, 25f }, ScopeLabels = new[] { "1.5x", "2.5x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 0.35f, RecoilClimb = 0.2f, SwayScoped = 0.4f, SwayHip = 0.9f, HipSpread = 1.8f, AdsSpread = 0.5f,
                ShotVolume = 0.65f, ShotPitch = 1.4f,
                ModelName = "04_submachine_gun", ViewOffset = new Vector3(0.2f, -0.2f, 0.34f),
            },
            new WeaponDefinition
            {
                Id = "shotgun", Name = "펌프 샷건",
                Description = "12게이지 펌프액션. 8발(예비 160발), 한 발에 산탄 10개. 근거리 압도적.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Bolt,
                RoundsPerMinute = 60f, BoltTime = 0.85f, MagSize = 8, Reserve = 160, ReloadTime = 3.2f,
                MuzzleVelocity = 380f, DragK = 0.004f, Damage = 16f, Pellets = 10,
                ScopeFovs = new[] { 45f }, ScopeLabels = new[] { "1.3x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 3.5f, RecoilClimb = 0.1f, SwayScoped = 0.5f, SwayHip = 1.0f, HipSpread = 3.2f, AdsSpread = 2.4f,
                ShotVolume = 1f, ShotPitch = 0.95f,
                ModelName = "05_pump_shotgun", ViewOffset = new Vector3(0.2f, -0.2f, 0.4f),
            },
            new WeaponDefinition
            {
                Id = "pistol", Name = "권총",
                Description = "9mm 반자동 권총. 15발 탄창(예비 330발). 보조무기로 방어전에 도전.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Semi,
                RoundsPerMinute = 300f, BoltTime = 0f, MagSize = 15, Reserve = 330, ReloadTime = 1.5f,
                MuzzleVelocity = 370f, DragK = 0.0028f, Damage = 30f,
                ScopeFovs = new[] { 45f }, ScopeLabels = new[] { "1.3x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 1.6f, RecoilClimb = 0.15f, SwayScoped = 0.45f, SwayHip = 0.8f, HipSpread = 1.2f, AdsSpread = 0.4f,
                ShotVolume = 0.7f, ShotPitch = 1.35f,
                ModelName = "06_service_pistol", ViewOffset = new Vector3(0.16f, -0.17f, 0.3f),
            },
        };

        public static WeaponDefinition Find(string id)
        {
            foreach (var w in All) if (w.Id == id) return w;
            return All[0];
        }
    }
}
