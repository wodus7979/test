using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// Resources/Enemies/SoldierModel 프리팹이 있으면 그것을 적 모델로 사용한다.
    /// (Mixamo 등에서 받은 실사 병사 모델 + Animator). 없으면 기본 프리미티브 병사를 쓴다.
    /// 메뉴 "Sniper Ridge > 적 모델 자동 설정" 으로 프리팹을 만들 수 있다.
    /// </summary>
    public static class EnemyModels
    {
        const string ResourcePath = "Enemies/SoldierModel";

        /// <summary>모델의 정면이 +Z 가 아니면 여기서 보정한다 (변환된 Mixamo FBX 는 180도).</summary>
        public const float YawOffset = 180f;
        static GameObject prefab;
        static bool searched;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetCache() { prefab = null; searched = false; }

        public static GameObject Prefab
        {
            get
            {
                if (!searched)
                {
                    searched = true;
                    prefab = Resources.Load<GameObject>(ResourcePath);
                    if (prefab != null) Debug.Log("[Sniper Ridge] 적 모델 프리팹을 사용합니다: " + ResourcePath);
                }
                return prefab;
            }
        }

        public static bool HasCustomModel => Prefab != null;
    }
}
