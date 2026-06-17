import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    Modal,
    PanResponder,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const CR_INSTR = require('@/assets/ins_images/choice_reaction.png'); 
const DEMO_ANIMATION = require('@/assets/animation/choice_reaction_demo.json'); 

export function ChoiceReactionDemo({ style }: { style?: any }) {
  const [isFullVideo, setIsFullVideo] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); // 控制是否为窄条状态

  // 动画值
  const panY = useRef(new Animated.Value(0)).current; // 拖拽Y轴偏移
  const collapseAnim = useRef(new Animated.Value(1)).current; // 1 = 展开, 0 = 收起

  // 配置拖拽手势
  const panResponder = useRef(
    PanResponder.create({
      // 只有纵向滑动超过 1 像素才接管手势，防止误触点击事件
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 1,
      onPanResponderGrant: () => {
        panY.setOffset((panY as any).__getValue());
        panY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: panY }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        panY.flattenOffset();
      },
    })
  ).current;

  // 切换收起/展开状态
  const toggleCollapse = (toCollapsed: boolean) => {
    setIsCollapsed(toCollapsed);
    Animated.timing(collapseAnim, {
      toValue: toCollapsed ? 0 : 1,
      duration: 250,
      useNativeDriver: false, // 涉及宽度变化，不能使用 native driver
    }).start();
  };

  // 全屏关闭处理
  const handleCloseFullVideo = () => {
    setIsFullVideo(false);
    toggleCollapse(true); // 关闭全屏后恢复为窄条状态
  };

  // 动画插值
  const boxWidth = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, SCREEN_W / 2.8] // 收起时宽度为 24，展开时为正常宽度
  });

  const contentOpacity = collapseAnim; // 展开内容的透明度

  const stripOpacity = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0] // 收起时的侧边栏透明度
  });

  return (
    <>
      <View style={[styles.imageContainer, style]}>
        <Image source={CR_INSTR} style={styles.crInstImg} resizeMode="contain" />

        {/* 悬浮窗 */}
        <Animated.View 
          style={[
            styles.floatingBox,
            {
              transform: [{ translateY: panY }],
              width: boxWidth,
            }
          ]}
          {...panResponder.panHandlers} // 绑定拖拽手势
        >
          {/* ----- 展开时的内容 ----- */}
          <Animated.View 
            style={[StyleSheet.absoluteFill, { opacity: contentOpacity, zIndex: isCollapsed ? -1 : 1 }]}
            pointerEvents={isCollapsed ? 'none' : 'auto'} // 收起时禁用点击
          >
            <Pressable style={styles.floatingPressable} onPress={() => setIsFullVideo(true)}>
              <LottieView source={DEMO_ANIMATION} style={styles.floatingLottie} progress={0.25} />
              <View style={styles.playButtonOverlay}>
                <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.8)" />
              </View>
            </Pressable>

            <TouchableOpacity style={styles.closeTinyButton} onPress={() => toggleCollapse(true)}>
              <Ionicons name="close-circle" size={24} color="#666" />
            </TouchableOpacity>
          </Animated.View>

          {/* ----- 收起时的窄条内容 ----- */}
          <Animated.View 
            style={[styles.collapsedStrip, { opacity: stripOpacity, zIndex: isCollapsed ? 1 : -1 }]}
            pointerEvents={!isCollapsed ? 'none' : 'auto'} // 展开时禁用点击
          >
            <TouchableOpacity style={styles.expandArea} onPress={() => toggleCollapse(false)}>
              <Ionicons name="chevron-back" size={24} color="#999" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>

      {/* 全屏播放模态框 */}
      <Modal visible={isFullVideo} transparent={true} animationType="fade" onRequestClose={handleCloseFullVideo}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseFullVideo} />
          
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={handleCloseFullVideo}>
              <Ionicons name="close" size={28} color="rgba(0,0,0,0.3)" />
            </TouchableOpacity>
            
            <LottieView source={DEMO_ANIMATION} style={styles.fullLottie} autoPlay loop />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  imageContainer: { position: 'relative', width: '100%' },
  crInstImg: { width: '100%', height: undefined, aspectRatio: 360/380 },
  
  // 悬浮窗基础样式
  floatingBox: {
    position: 'absolute',
    bottom: -10, 
    right: 8,
    height: SCREEN_W / 2.8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    
    // overflow: 'hidden',
  },
  floatingPressable: { width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden' },
  floatingLottie: { width: '100%', height: '100%' },
  playButtonOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  closeTinyButton: { position: 'absolute', top: -10, right: -10, backgroundColor: '#FFF', borderRadius: 12 },

  // 收起时的窄条样式
  collapsedStrip: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  expandArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' },
  
  modalContent: { 
    width: SCREEN_W * 0.85, 
    height: SCREEN_W * 0.85, 
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 0, 
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: { position: 'absolute', top: 10, right: 10, zIndex: 10 },
  fullLottie: { width: '100%', height: '100%' },
});