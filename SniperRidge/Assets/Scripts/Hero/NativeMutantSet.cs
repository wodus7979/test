using UnityEngine;

namespace SniperRidge
{
    // The four supplied FBXs share one mesh, bind skeleton and texture set.
    // Native clips preserve that skeleton; held props use hand IK without changing the mesh.
    public sealed class NativeMutantSet : ScriptableObject
    {
        public GameObject Model;
        public AnimationClip Transform, Punch, Jump, Run;
        public AnimationClip Idle, Hit, Block, Clap, JumpDown;
        public AnimationClip ThrowIn, Harvesting, PoleAttack;
        public AnimationClip PropClip(HulkController.Attack attack)=>attack==HulkController.Attack.BarrelThrow?ThrowIn:attack==HulkController.Attack.Uproot?Harvesting:PoleAttack;
        public Vector3 IdleStart, IdleEnd;
        public float Scale=1, GroundOffset, RunStride;
        public Vector3 RunStart,RunEnd;
        public float JumpTakeoff=1.2f,JumpApex=1.5f,JumpLanding=1.9f;
        public AnimationCurve JumpRootLift;
        public float DropTakeoff=1f,DropApex=1.17f,DropLanding=1.633333f;
        public bool FourActionsOnly=true;
    }
}
