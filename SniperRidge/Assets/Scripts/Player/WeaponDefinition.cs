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

        public float Interval => 60f / RoundsPerMinute;

        public static readonly WeaponDefinition[] All =
        {
            new WeaponDefinition
            {
                Id = "sniper", Name = "볼트액션 저격소총",
                Description = "7.62mm 볼트액션. 5발 탄창, 8~30배 조준경.\n임무: 능선 잠복 저격 (적 10명)",
                Mission = MissionType.Sniper, Fire = FireMode.Bolt,
                RoundsPerMinute = 40f, BoltTime = 1.15f, MagSize = 5, Reserve = 25, ReloadTime = 2.6f,
                MuzzleVelocity = 850f, DragK = 0.00087f, Damage = 100f,
                ScopeFovs = new[] { 7.5f, 3.75f, 2f }, ScopeLabels = new[] { "8x", "16x", "30x" }, DefaultZoomIndex = 1, HasZeroing = true,
                RecoilKick = 2.4f, RecoilClimb = 0f, SwayScoped = 0.32f, SwayHip = 0.9f, HipSpread = 0f, AdsSpread = 0f,
                ShotVolume = 1f, ShotPitch = 0.9f,
            },
            new WeaponDefinition
            {
                Id = "dmr", Name = "지정사수 소총",
                Description = "7.62mm 반자동. 10발 탄창, 4~8배 조준경. 연사가 되지만 반동이 큼.\n임무: 능선 잠복 저격 (적 10명)",
                Mission = MissionType.Sniper, Fire = FireMode.Semi,
                RoundsPerMinute = 180f, BoltTime = 0f, MagSize = 10, Reserve = 40, ReloadTime = 2.4f,
                MuzzleVelocity = 800f, DragK = 0.00095f, Damage = 90f,
                ScopeFovs = new[] { 15f, 7.5f }, ScopeLabels = new[] { "4x", "8x" }, DefaultZoomIndex = 1, HasZeroing = true,
                RecoilKick = 1.4f, RecoilClimb = 0.12f, SwayScoped = 0.4f, SwayHip = 1.0f, HipSpread = 0.5f, AdsSpread = 0.06f,
                ShotVolume = 0.95f, ShotPitch = 1.0f,
            },
            new WeaponDefinition
            {
                Id = "rifle", Name = "돌격소총",
                Description = "5.56mm 자동. 30발 탄창, 2~4배 광학 조준기.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Auto,
                RoundsPerMinute = 650f, BoltTime = 0f, MagSize = 30, Reserve = 180, ReloadTime = 2.2f,
                MuzzleVelocity = 900f, DragK = 0.0012f, Damage = 40f,
                ScopeFovs = new[] { 30f, 15f }, ScopeLabels = new[] { "2x", "4x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 0.55f, RecoilClimb = 0.25f, SwayScoped = 0.45f, SwayHip = 1.1f, HipSpread = 2.2f, AdsSpread = 0.35f,
                ShotVolume = 0.75f, ShotPitch = 1.3f,
            },
            new WeaponDefinition
            {
                Id = "lmg", Name = "경기관총",
                Description = "7.62mm 자동, 100발 탄띠. 양각대 거치 시(조준) 산포 감소. 재장전이 느림.\n임무: 진지 방어 (몰려오는 적 5개 웨이브)",
                Mission = MissionType.Defense, Fire = FireMode.Auto,
                RoundsPerMinute = 700f, BoltTime = 0f, MagSize = 100, Reserve = 300, ReloadTime = 4.5f,
                MuzzleVelocity = 850f, DragK = 0.001f, Damage = 45f,
                ScopeFovs = new[] { 40f, 20f }, ScopeLabels = new[] { "1.5x", "3x" }, DefaultZoomIndex = 0, HasZeroing = false,
                RecoilKick = 0.7f, RecoilClimb = 0.18f, SwayScoped = 0.3f, SwayHip = 1.4f, HipSpread = 3.2f, AdsSpread = 0.7f,
                ShotVolume = 0.85f, ShotPitch = 1.1f,
            },
        };

        public static WeaponDefinition Find(string id)
        {
            foreach (var w in All) if (w.Id == id) return w;
            return All[0];
        }
    }
}
