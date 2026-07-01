import { createDrawer, DRAWER_EDGE } from './drawer'
import { createModal, type ModalAction } from './modal'
import { isCompactViewport } from './responsive'
import { OVERLAY_MOUNT } from './shell'

export interface DialogParams {
  title: string
  content: HTMLElement
  actions?: ModalAction[]
  anchor?: HTMLElement
}

export interface DialogHandle {
  close: () => void
}

// Opens a dialog that adapts to the screen: a centered modal on desktop, a
// bottom drawer on small screens. The library's single modal-vs-drawer switch.
// Mounts at viewport level so an embedded editor's box can't clip it.
export const openDialog = (params: DialogParams): DialogHandle => {
  const dialog = isCompactViewport()
    ? createDrawer({
        edge: DRAWER_EDGE.BOTTOM,
        mount: OVERLAY_MOUNT.VIEWPORT,
        ...params,
      })
    : createModal({ mount: OVERLAY_MOUNT.VIEWPORT, ...params })
  dialog.open()
  return dialog
}
