using UnityEngine;

namespace SniperRidge
{
    /// <summary>적 신체 부위 콜라이더에 붙어 어느 부위인지 알려준다.</summary>
    public class EnemyHitbox : MonoBehaviour
    {
        public EnemySoldier Owner;
        public bool IsHead;
    }
}
